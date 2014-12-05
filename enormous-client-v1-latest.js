;

var enormousSocket = null;

function enormous(options) {
    options = options || {};
    options.events = options.events || {};

    var socketURL = "https://sockets.enormous.io:443";
    //var socketURL = "http://localhost:3000";

    if (!enormousSocket)
        enormousSocket = io(socketURL);

    var self = this;

    self.clientID = null;
    self.socket = enormousSocket;
    self.debug = options.debug || false;

    self.appKey = options.appKey;
    self.basicAuthUsername = options.basicAuthUsername || false;
    self.basicAuthPassword = options.basicAuthPassword || false;

    var getRequestParameters = function (options) {
        options = options || {};

        options.apiKey = options.appKey || self.appKey;
        options.basicUsername = options.basicUsername || self.basicUsername;
        options.basicPassword = options.basicPassword || self.basicPassword;

        return options;
    };

    enormousSocket
        .on('connecting', function () {
            if (self.debug)
                console.info('Connecting to enormous', socketURL)

            if(options.events.connecting)
                options.events.connecting(self);
        })
        .on('connect', function () {
            if (self.debug)
                console.info('Connected to enormous', socketURL)

            if(options.events.connect)
                options.events.connect(self);
        })
        .on('disconnect', function () {
            if (self.debug)
                console.error('Disconnected from enormous', socketURL)

            if(options.events.disconnected)
                options.events.disconnected(self);
        })
        .on('connect_failed', function () {
            if (self.debug)
                console.error('Connection to enormous failed', socketURL)

            if(options.events.connect_failed)
                options.events.connect_failed(self);
        })
        .on('reconnecting', function () {
            if (self.debug)
                console.info('Reconnecting to enormous', socketURL)

            if(options.events.reconnecting)
                options.events.reconnecting(self);
        })
        .on('enormous_clientID', function (data) {
            self.clientID = data.clientID;
        });

    self.executeMethod = function (options, next) {
        options = options || {};

        next = next || options.onData || function () {
        };

        var methodName = options.methodName || self.methodName,
            auth,
            params = options.params || false;

        if (options.auth) {
            auth = options.auth;
        } else if (params.auth) {
            auth = params.auth;
            params = params.params;
        }

        var watchMethodParams = {
            apiKey: self.appKey,
            methodName: methodName,
            basicAuthUsername: self.basicAuthUsername,
            basicAuthPassword: self.basicAuthPassword,
            auth: auth,
            params: params
        };

        enormousSocket.emit('executeMethod', watchMethodParams, function (data) {
            if (self.debug)
                console.info('Response from watchMethod request: ', data);

            next(data);
        });

        enormousSocket.on("enormous_timestampHashUpdate", function (timestampUpdate) {
            if (watchMethodParams.auth && timestampUpdate.requestData.apiKey === self.appKey) {
                watchMethodParams.auth.timestamp = timestampUpdate.data.timestamp;
                watchMethodParams.auth.timestampHash = timestampUpdate.data.timestampHash;

                if (self.debug)
                    console.info('Updating auth timestamp', timestampUpdate)
            }
        });

        return self;
    };

    self.watchMethod = function (options, next) {
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

        if (options.auth) {
            auth = options.auth;
        } else if (params.auth) {
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
        };

        enormousSocket.on('connect', function () {
            enormousSocket.emit('watchMethod', watchMethodParams, function (data) {
                if (self.debug)
                    console.info('Response from watchMethod request: ', data);

                if (watchMethodParams.fetchInitialData) {
                    onDataFunc(data);

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

                if (self.debug)
                    console.info('Updating auth timestamp', timestampUpdate)
            }
        });

        return self;
    };

    self.joinChannel = function (options, next) {
        next = next || function () {
        };
        options = getRequestParameters(options);

        var data = {
            apiKey: options.apiKey,
            auth: options.auth,
            basicUsername: options.basicUsername,
            basicPassword: options.basicPassword,
            channel: options.channel
        };

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

                    if (self.debug)
                        console.info('Updating auth timestamp', timestampUpdate)
                }
            });
        });

        return self;
    };

    self.leaveChannel = function (channel, next) {
        next = next || function () {
        };

        var options = getRequestParameters({channel: channel});

        enormousSocket.emit('leaveChannel', options, function (data) {
            if (self.debug)
                console.info('Response from leaveChannel: ', data);

            next(data);
        });

        return self;
    };

    self.bindAction = function (channel, actionName, next) {
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
    };

    return self;
}
