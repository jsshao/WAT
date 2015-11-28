'use strict';

(function() {
    var activeTab = -1;
    var audioStream = null;
    // var url = 'http://wat.hpp3.com/';
    var url = 159.203.114.155;
    var socket = io.connect(url);

    var config = {'iceServers': [{'url': 'stun:stun.l.google.com:19302'}]};
    var turnReady = false;

    var lastClient = null;

    var hardcoded = {
            'url': 'turn:198.199.78.57:2222?transport=udp', 
            'username':'username', 
            'credential': 'password'
        };

    function updateTurn(callback) {
                console.log("Using WAT-TURN as TURN server");
                config.iceServers.push(hardcoded);
                callback();
    }

    updateTurn(function() {
        turnReady = true;
    });

    var pc;
    var usersConnected;
    var started = false;
    var currentRoom = null;

    function handleStream() {
        var code = [];
        var codelength = 3;
        for (var i = 0; i < codelength; i++) {
            code.push('ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)]);
        }
        usersConnected = 0;
        started = false;

        currentRoom = code.join('');
        socket.emit('create room', currentRoom);
        console.log('created room', currentRoom);
        alert("Use the code "+currentRoom+" at "+url+" to connect");
    }

    function sendMessage(message) {
        socket.emit('message', message);
    }

    function sendMessageTo(id, message) {
        socket.emit('messageTo', [message, id]);
    }

    socket.on('join', function(who) {
        usersConnected += 1;
        lastClient = who;
        maybeStart();
        console.log('user', who, 'joined the room, population:', usersConnected);
    });

    socket.on('message', function (message) {
        console.log('received message: ', message);
        if (message.type === 'answer' && started) {
            pc.setRemoteDescription(new RTCSessionDescription(message)); 
        } else if (message.type === 'candidate' && started) {
            var candidate = new RTCIceCandidate({
                sdpMLineIndex: message.label,
                candidate: message.candidate
            });
            pc.addIceCandidate(candidate);
        } else if (message === 'bye' && started) {
            usersConnected -= 1;
            console.log('user left, now ', usersConnected, ' remaining');
        } else if (message === 'got user media') {
            maybeStart();
        }
    });
    socket.on('message_v2', function (obj) {
        console.log('received obj: ', obj);
        var message = obj[0]; 
        var id = obj[1];
        console.log('received message: ', message);
        if (message.type === 'answer' && started) {
            pc.setRemoteDescription(new RTCSessionDescription(message)); 
        } else if (message.type === 'candidate' && started) {
            var candidate = new RTCIceCandidate({
                sdpMLineIndex: message.label,
                candidate: message.candidate
            });
            pc.addIceCandidate(candidate);
        } else if (message === 'bye' && started) {
            usersConnected -= 1;
            console.log('user left, now ', usersConnected, ' remaining');
        } else if (message === 'got user media') {
            maybeStart();
        }
    });

    function createPeerConnection() {
        try {
            pc = new webkitRTCPeerConnection(config);
            pc.onicecandidate = handleIceCandidate;
            pc.onaddstream = handleRemoteStreamAdded;
            pc.onremovestream = handleRemoteStreamRemoved;
            console.log('created RTCPeerConnection');
        } catch (e) {
            console.log('failed to create PeerConnection with exception: ' + e.message);
            alert('cannot create RTCPeerConnection object');
            return;
        }
    }

    function handleIceCandidate(event) {
        console.log('handleIceCandidate event: ', event);
        if (event.candidate) {
            // sendMessage({
            sendMessageTo(lastClient, {
                type: 'candidate',
                label: event.candidate.sdpMLineIndex,
                id: event.candidate.sdpMid,
                candidate: event.candidate.candidate});
        } else {
            console.log('no more candidates');
        }
    }

    function handleRemoteStreamAdded(event) {
        console.log('remote stream added??', event);
    }

    function handleRemoteStreamRemoved(event) {
        console.log('remote stream removed??', event);
    }

    function hangup() {
        console.log('hangup');
        if (pc != null) {
            pc.close();
            pc = null;
        }
        sendMessage('bye');
    }

    function maybeStart() {
        console.log('maybe start?');
        if (usersConnected > 0 /*&& !started */ && audioStream != null) {
            console.log('yeah');
            start();
        } else {
            console.log('nah: ', usersConnected, started, audioStream);
        }
    }

    function start() {
        createPeerConnection();
        pc.addStream(audioStream);
        started = true;
        pc.createOffer(handleLocalDescription, handleCreateOfferError);
    }

    function handleLocalDescription(sessionDescription) {
        pc.setLocalDescription(sessionDescription);
        console.log('handle local session description', sessionDescription, 'to', lastClient);
        sendMessageTo(lastClient, sessionDescription);
        // sendMessage(sessionDescription);
    }

    function handleCreateOfferError(e) {
        console.log('createOffer error ', e); 
    }

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

    chrome.browserAction.onClicked.addListener(function (tab) {
        if (turnReady) {
            chrome.tabCapture.getCapturedTabs(function (tabs) {
                if (audioStream != null) {
                    console.log("stopping capture");
                    var tracks = audioStream.getTracks();
                    tracks.forEach(function(track) {
                        track.stop();
                    });
                    if (activeTab == tab.id) {
                        activeTab = -1;
                        return;   
                    }
                };
                console.log("capturing");
                chrome.tabCapture.capture({'audio':true, 'video':false}, function (stream) {
                    audioStream = stream;
                    audioStream.onended = function(evt) {
                        chrome.browserAction.setIcon({path:"icon.png"});
                        hangup();
                        audioStream = null;
                    };
                    chrome.browserAction.setIcon({path:"playing.png"});
                    activeTab = tab.id;
                    handleStream();
                });
            });
        }
    });
})();
