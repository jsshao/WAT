'use strict';

document.addEventListener('DOMContentLoaded', function() {
    var code = [];
    var codelength = 3;

    for (var i = 0; i < codelength; i++) 
        code.push('ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)]);

    // Set default room code
    var room = document.getElementById("room");
    room.value = code.join('');
    room.select();
    var bgPage = chrome.extension.getBackgroundPage();
    if (bgPage.audioStream != null) {
        document.getElementById('room-id').innerHTML = bgPage.room;
        document.getElementById('playing').className = '';
        document.getElementById('create-form').className = 'hidden';
    } else {
        document.getElementById('playing').className = 'hidden';
        document.getElementById('create-form').className = '';
    }

    document.getElementById("stop").addEventListener('click', function() {
        bgPage.stopCapture();
        document.getElementById('playing').className = 'hidden';
        document.getElementById('create-form').className = '';
    });

    document.getElementById("submit").addEventListener('click', function() {
        if (bgPage.turnReady) {
            bgPage.startCapture(room.value);
            document.getElementById('room-id').innerHTML = room.value;
            document.getElementById('playing').className = '';
            document.getElementById('create-form').className = 'hidden';
        }
    });
}, false);
