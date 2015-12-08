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

    document.getElementById("submit").addEventListener('click', function() {
        var bgPage = chrome.extension.getBackgroundPage();
        bgPage.startCapture(room.value);
    });
}, false);
