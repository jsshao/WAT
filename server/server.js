var static = require('node-static');
var http = require('http');
var file = new(static.Server)();
var sys = require('sys');
var exec = require('child_process').exec;
var lastUpdate = 0;
var app = http.createServer(function (req, res) {
    file.serve(req, res);
}).listen(2015);

var io = require('socket.io').listen(app);

var rooms = {};
var users = {};

io.sockets.on('connection', function (socket){

	console.log( 'new connection established' );

	var log = function() {
        console.log(arguments);
	};

	socket.on('message', function (message) {
        var room = users[socket.id];
        log('ROOM: '+ room+ ', message:'+ message, ' from '+ socket.id+ ' to all');
		io.sockets.in(room).emit('message_v2', [message, socket.id]);
		// io.sockets.in(room).emit('message', message);
	});

	socket.on('messageTo', function (obj) {
        var message = obj[0];
        var id = obj[1];
        var room = users[socket.id];
        io.to(id).emit('message_v2', [message, socket.id]);
	});

	socket.on('create room', function (room) {
		//var numClients = io.sockets.clients(room).length;

		//log('Room ' + room + ' has ' + numClients + ' client(s)');
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
		//var numClients = io.sockets.clients(room).length;

		//log('Room ' + room + ' has ' + numClients + ' client(s)');
		log('Request to join room', room);
        log('debug info: ' + rooms[room] + ' ' + JSON.stringify(rooms));

		if (rooms[room] == 'created') {
            users[socket.id] = room;
            io.sockets.in(room).emit('join', socket.id);
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
