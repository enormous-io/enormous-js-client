var enormousSocket = null;

function enormous(options) {
    //var socketURL = "https://sockets.enormous.io:443",
    //    ajaxEndpoint = 'https://enormous.io:443/apps/';
    var socketURL = "http://localhost:3000",
        ajaxEndpoint = 'http://localhost:3000/apps/';

    if (!enormousSocket)
        enormousSocket = io(socketURL);

    this.clientID;
    this.socket = enormousSocket;
    this.debug = options.debug || false;

    this.appKey = options.appKey;
    this.basicAuthUsername = options.basicAuthUsername || false;
    this.basicAuthPassword = options.basicAuthPassword || false;

    var self = this;

    var getRequestParameters = function (options) {
        options = options || {};

        options.apiKey = options.appKey || self.appKey;
        options.basicUsername = options.basicUsername || self.basicUsername;
        options.basicPassword = options.basicPassword || self.basicPassword;

        return options;
    }

    enormousSocket
        .on('connecting', function () {
            if (self.debug)
                console.info('Connecting to enormous', socketURL)
        })
        .on('connect', function () {
            if (self.debug)
                console.info('Connected to enormous', socketURL)
        })
        .on('disconnect', function () {
            if (self.debug)
                console.error('Disconnected from enormous', socketURL)
        })
        .on('connect_failed', function () {
            if (self.debug)
                console.error('Connection to enormous failed', socketURL)
        })
        .on('reconnecting', function () {
            if (self.debug)
                console.info('Reconnecting to enormous', socketURL)
        })
        .on('enormous_clientID', function (data) {
            self.clientID = data.clientID;
        });

    this.executeMethod = function (options) {
        options = getRequestParameters(options);

        var requestData,
            params = options.params || false,
            methodName = options.methodName,
            onDataFunc = function (data) {
                if (self.debug)
                    console.info('Ajax data received for method: ' + methodName + '. Data: ', data);

                if (options.onData)
                    options.onData(data);
            };

        if (options.auth) {
            requestData = {
                auth: options.auth,
                params: params
            }
        } else {
            requestData = params;
        }

        $.ajax({
            url: ajaxEndpoint + self.appKey + '/' + methodName,
            data: requestData,
            dataType: 'json',
            beforeSend: function (xhr) {
                if (self.basicAuthUsername && self.basicAuthPassword)
                    xhr.setRequestHeader("Authorization", "Basic " + btoa(self.basicAuthUsername + ":" + self.basicAuthPassword));
            },
            success: onDataFunc
        });

        return self;
    }

    this.watchMethod = function (options, next) {
        options = options || {};
        next = next || function () {
        };

        options.onData = typeof options.onData === "function" ? options.onData : function () {
        };

        var fetchDataOnInit = options.fetchDataOnInit || false,
            methodName = options.methodName || self.methodName,
            auth,
            params = options.params || false,
            onDataFunc = function (data) {
                data = data || {requestData: {}};

                if (data.requestData.apiKey !== self.appKey || data.requestData.methodName !== methodName)
                    return false;

                if (self.debug)
                    console.info('Realtime data received for method: ' + methodName + '. Data: ', data);

                options.onData(data);
            };

        if(options.auth){
            auth = options.auth;
        }else if (params.auth) {
            auth = params.auth;
            params = params.params;
        }

        var watchMethodParams = {
            apiKey: self.appKey,
            methodName: methodName,
            basicAuthUsername: self.basicAuthUsername,
            basicAuthPassword: self.basicAuthPassword,
            auth: auth,
            params: params,
            fetchInitialData: fetchDataOnInit
        }

        enormousSocket.on('connect', function () {
            enormousSocket.emit('watchMethod', watchMethodParams, function (data) {
                if (self.debug)
                    console.info('Response from watchMethod request: ', data);

                 if(watchMethodParams.fetchInitialData) {
                     onDataFunc(data)

                     watchMethodParams.fetchInitialData = false;
                 }

                next(data);
            });
        });

        enormousSocket.on("enormous_watchMethodOutcome", onDataFunc);

        enormousSocket.on("enormous_timestampHashUpdate", function (timestampUpdate) {
            if (watchMethodParams.auth && timestampUpdate.requestData.apiKey === self.appKey) {
                watchMethodParams.auth.timestamp = timestampUpdate.data.timestamp;
                watchMethodParams.auth.timestampHash = timestampUpdate.data.timestampHash;

                if(self.debug)
                    console.info('Updating auth timestamp', timestampUpdate)
            }
        });

        return self;
    }

    this.joinChannel = function (options, next) {
        next = next || function () {
        };
        options = getRequestParameters(options);

        var data = {
            apiKey: options.apiKey,
            auth: options.auth,
            basicUsername: options.basicUsername,
            basicPassword: options.basicPassword,
            channel: options.channel
        }

        enormousSocket.on('connect', function () {
            enormousSocket.emit('joinChannel', data, function (data) {
                if (self.debug)
                    console.info('Response from joinChannel: ', data);

                next(data);
            });

            enormousSocket.on("enormous_timestampHashUpdate", function (timestampUpdate) {
                if (data.auth && timestampUpdate.requestData.apiKey === self.appKey) {
                    data.auth.timestamp = timestampUpdate.data.timestamp;
                    data.auth.timestampHash = timestampUpdate.data.timestampHash;

                    if(self.debug)
                        console.info('Updating auth timestamp', timestampUpdate)
                }
            });
        });

        return self;
    }

    this.leaveChannel = function (channel, next) {
        next = next || function () {
        };

        var options = getRequestParameters({channel: channel});

        enormousSocket.emit('leaveChannel', options, function (data) {
            if (self.debug)
                console.info('Response from leaveChannel: ', data);

            next(data);
        });

        return self;
    }

    this.bindAction = function (channel, actionName, next) {
        enormousSocket.on(actionName, function (data) {
            if (!data.requestData || typeof data.requestData !== 'object')
                return false;

            if (data.requestData.apiKey === self.appKey && channel && data.requestData.channel === channel) {
                data.data = data.data || null;

                var jsonData;

                if (data.data)
                    try {
                        jsonData = JSON.parse(data.data)
                    } catch (err) {
                    }

                var functionData = jsonData || data.data;

                if (typeof next === 'function')
                    next(functionData, data)
            }
        });

        return self;
    }

    return this;
}
