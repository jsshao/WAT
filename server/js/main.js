'use strict';

var isChannelReady;
var isInitiator = false;
var isStarted = false;
var localStream;
var pc;
var remoteStream;
var turnReady;
var url = '159.203.114.155:80';

var turn_server = {
    'url': 'turn:198.199.78.57:2222?transport=udp', 
    'username':'username', 
    'credential': 'password'
};   
var pc_config = {'iceServers': [{'url': 'stun:stun.l.google.com:19302'}, turn_server]};

var pc_constraints = {'optional': [{'DtlsSrtpKeyAgreement': true}]};

// Set up audio and video regardless of what devices are present.
var sdpConstraints = {'mandatory': {
    'OfferToReceiveAudio':true,
        'OfferToReceiveVideo':true }};

/////////////////////////////////////////////

var socket = io.connect();

var room = location.pathname.substring(1);

document.getElementById("submit").addEventListener("click", function(){
    var inputBox = document.getElementById("code");
    room = inputBox.value;

    //handle this and show "Connected" or provide error message if connection failed"
    this.innerHTML = "CONNECTED";
    inputBox.disabled = true;
    playAudio();
});


if (room !== '') {
    playAudio();
}

function playAudio() {
    if (room !== '') {
        console.log('join room', room);
        socket.emit('join room', room);
    } else {
        console.log('This should never happen. Tried to join EMPTY room');
    }   
}
    
socket.on('created', function (room){
    console.log('Created room ' + room);
    console.log('this should not happen');
    isInitiator = true;
});

socket.on('error', function (msg) {
    console.log('ERROR: ' + JSON.stringify(msg));
});

socket.on('room not found', function () {
    room = prompt("Room not found. Try again or cancel.");
    if (room === null) return;
    console.log('join room', room);
    socket.emit('join room', room);
});

socket.on('join', function (room){
    console.log('Join called. this should not happen');
    isChannelReady = true;
});

socket.on('joined', function (room){
    console.log('This peer has joined room ' + room);
    isChannelReady = true;
});

socket.on('log', function (array){
    console.log.apply(console, array);
});

////////////////////////////////////////////////

function sendMessage(message){
    console.log('Client sending message: ', message);
    socket.emit('message', message);
}

socket.on('message_v2', function (obj){
    console.log('client received obj: ', obj);
    var message = obj[0]; 
    var id = obj[1];
    console.log('client received message: ', message);
    if (message === 'got user media') {
        maybeStart();
    } else if (message.type === 'offer') {
        if (!isStarted) {
            maybeStart();
        }
        pc.setRemoteDescription(new RTCSessionDescription(message));
        doAnswer();
    } else if (message.type === 'answer' && isStarted) {
        pc.setRemoteDescription(new RTCSessionDescription(message));
    } else if (message.type === 'candidate' && isStarted) {
        var candidate = new RTCIceCandidate({
            sdpMLineIndex: message.label,
            candidate: message.candidate
        });
        pc.addIceCandidate(candidate);
    } else if (message === 'bye' && isStarted) {
        handleRemoteHangup();
    }
});
socket.on('message', function (message){
    console.log('Client received message:', message);
    if (message === 'got user media') {
        maybeStart();
    } else if (message.type === 'offer') {
        if (!isStarted) {
            maybeStart();
        }
        pc.setRemoteDescription(new RTCSessionDescription(message));
        doAnswer();
    } else if (message.type === 'answer' && isStarted) {
        pc.setRemoteDescription(new RTCSessionDescription(message));
    } else if (message.type === 'candidate' && isStarted) {
        var candidate = new RTCIceCandidate({
            sdpMLineIndex: message.label,
            candidate: message.candidate
        });
        pc.addIceCandidate(candidate);
    } else if (message === 'bye' && isStarted) {
        handleRemoteHangup();
    }
});

////////////////////////////////////////////////////

var remoteAudio = document.querySelector('#remoteAudio');



function maybeStart() {
    if (!isStarted && isChannelReady) {
        console.log("We are starting!");
        createPeerConnection();
        isStarted = true;
    }
}

window.onbeforeunload = function(e){
    sendMessage('bye');
}

/////////////////////////////////////////////////////////

function createPeerConnection() {
    try {
        pc = new RTCPeerConnection(pc_config);
        pc.onicecandidate = handleIceCandidate;
        pc.onaddstream = handleRemoteStreamAdded;
        pc.onremovestream = handleRemoteStreamRemoved;
        console.log('Created RTCPeerConnnection');
    } catch (e) {
        console.log('Failed to create PeerConnection, exception: ' + e.message);
        alert('Cannot create RTCPeerConnection object.');
        return;
    }
}

function handleIceCandidate(event) {
    console.log('handleIceCandidate event: ', event);
    if (event.candidate) {
        sendMessage({
            type: 'candidate',
            label: event.candidate.sdpMLineIndex,
            id: event.candidate.sdpMid,
            candidate: event.candidate.candidate});
    } else {
        console.log('End of candidates.');
    }
}

function handleCreateOfferError(event){
sendMessage('got user media');
    console.log('createOffer() error: ', e);
}

function doCall() {
    console.log('Sending offer to peer');
    pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
}

function doAnswer() {
    console.log('Sending answer to peer.');
    pc.createAnswer(setLocalAndSendMessage, null, sdpConstraints);
}

function setLocalAndSendMessage(sessionDescription) {
    // Set Opus as the preferred codec in SDP if Opus is present.
    // sessionDescription.sdp = preferOpus(sessionDescription.sdp);
    pc.setLocalDescription(sessionDescription);
    console.log('setLocalAndSendMessage sending message' , sessionDescription);
    sendMessage(sessionDescription);
}

function handleRemoteStreamAdded(event) {
    console.log('Remote stream added.', event);
    window.remote = event;
    remoteAudio.src = window.URL.createObjectURL(event.stream);
    remoteStream = event.stream;
    document.getElementById("submit").innerHTML = "CONNECTED";
}

function handleRemoteStreamRemoved(event) {
    console.log('Remote stream removed. Event: ', event);
    var submit = document.getElementById("submit");
    submit.innerHTML = "RECONNECT";
    submit.style.pointerEvents = 'auto';
    document.getElementById("code").disabled = false;
}

function hangup() {
    console.log('Hanging up.');
    stop();
    sendMessage('bye');
}

function handleRemoteHangup() {
    console.log("Remote side hung up. Please recreate the room and reconnect");
    var submit = document.getElementById("submit");
    submit.innerHTML = "RECONNECT";
    submit.style.pointerEvents = 'auto';
    document.getElementById("code").disabled = false;
}

function stop() {
    isStarted = false;
    // isAudioMuted = false;
    // isVideoMuted = false;
    pc.close();
    pc = null;
}

///////////////////////////////////////////

// Set Opus as the default audio codec if it's present.
function preferOpus(sdp) {
    var sdpLines = sdp.split('\r\n');
    var mLineIndex = null;
    // Search for m line.
    for (var i = 0; i < sdpLines.length; i++) {
        if (sdpLines[i].search('m=audio') !== -1) {
            mLineIndex = i;
            break;
        }
    }
    console.log(mLineIndex);
    if (mLineIndex === null) {
        return sdp;
    }

    // If Opus is available, set it as the default in m line.
    for (i = 0; i < sdpLines.length; i++) {
        if (sdpLines[i].search('opus/48000') !== -1) {
            var opusPayload = extractSdp(sdpLines[i], /:(\d+) opus\/48000/i);
            if (opusPayload) {
                sdpLines[mLineIndex] = setDefaultCodec(sdpLines[mLineIndex], opusPayload);
            }
            break;
        }
    }

    // Remove CN in m line and sdp.
    sdpLines = removeCN(sdpLines, mLineIndex);

    sdp = sdpLines.join('\r\n');
    return sdp;
}

function extractSdp(sdpLine, pattern) {
    var result = sdpLine.match(pattern);
    return result && result.length === 2 ? result[1] : null;
}

// Set the selected codec to the first in m line.
function setDefaultCodec(mLine, payload) {
    var elements = mLine.split(' ');
    var newLine = [];
    var index = 0;
    for (var i = 0; i < elements.length; i++) {
        if (index === 3) { // Format of media starts from the fourth.
            newLine[index++] = payload; // Put target payload to the first.
        }
        if (elements[i] !== payload) {
            newLine[index++] = elements[i];
        }
    }
    return newLine.join(' ');
}

// Strip CN from sdp before CN constraints is ready.
function removeCN(sdpLines, mLineIndex) {
    console.log(sdpLines);
    var mLineElements = sdpLines[mLineIndex].split(' ');
    // Scan from end for the convenience of removing an item.
    for (var i = sdpLines.length-1; i >= 0; i--) {
        var payload = extractSdp(sdpLines[i], /a=rtpmap:(\d+) CN\/\d+/i);
        if (payload) {
            var cnPos = mLineElements.indexOf(payload);
            if (cnPos !== -1) {
                // Remove CN payload from m line.
                mLineElements.splice(cnPos, 1);
            }
            // Remove CN line in sdp
            sdpLines.splice(i, 1);
        }
    }

    sdpLines[mLineIndex] = mLineElements.join(' ');
    return sdpLines;
}
