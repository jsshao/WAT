var static = require('node-static');
var http = require('http');
var file = new(static.Server)();
var sys = require('sys');
var exec = require('child_process').exec;
var lastUpdate = 0;
var app = http.createServer(function (req, res) {
    req.addListener('end', function () {
        var now = Date.now();
        if (now - lastUpdate > 30000) {
            console.log("updating turnserver");
            exec('curl "https://computeengineondemand.appspot.com/turn?username=41784574&key=4080218913" > turnserver', function(error, stdout, stderr) {
                file.serve(req, res);
            });
            lastUpdate = now;
        } else {
            file.serve(req, res);
        }
    }).resume(); 
}).listen(80);

var io = require('socket.io').listen(app);

var rooms = {};
var users = {};

io.sockets.on('connection', function (socket){

	function log() {
		var array = [">>> Message from server: "];
	  for (var i = 0; i < arguments.length; i++) {
	  	array.push(arguments[i]);
	  }
	    socket.emit('log', array);
	}

	socket.on('message', function (message) {
        var room = users[socket.id];
		log('Got message: ', message, ', room: ', room);
		io.sockets.in(room).emit('message', message);
	});

	socket.on('create room', function (room) {
		var numClients = io.sockets.clients(room).length;

		log('Room ' + room + ' has ' + numClients + ' client(s)');
		log('Request to create room', room);
        log('debug info: ' + rooms[room] + ' ' + JSON.stringify(rooms));

        if (rooms[room] != 'created') {
			socket.join(room);
            rooms[room] = 'created';
            users[socket.id] = room;
			socket.emit('created', room);
            log('creating room ', room);
		} else {
            console.log("room already created: ", room);
		}
		socket.emit('emit(): client ' + socket.id + ' created room ' + room);
		socket.broadcast.emit('broadcast(): client ' + socket.id + ' joined room ' + room);

	});
	socket.on('join room', function (room) {
		var numClients = io.sockets.clients(room).length;

		log('Room ' + room + ' has ' + numClients + ' client(s)');
		log('Request to join room', room);
        log('debug info: ' + rooms[room] + ' ' + JSON.stringify(rooms));

		if (rooms[room] == 'created') {
            users[socket.id] = room;
            io.sockets.in(room).emit('join', room);
			socket.join(room);
			socket.emit('joined', room);
		} else { 
			socket.emit('room not found');
            return;
		}
		socket.emit('emit(): client ' + socket.id + ' joined room ' + room);
		socket.broadcast.emit('broadcast(): client ' + socket.id + ' joined room ' + room);

	});

});
