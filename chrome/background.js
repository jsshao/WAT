(function() {
    var activeTab = -1;
    var audioStream = null;
    chrome.browserAction.onClicked.addListener(function (tab) {
        chrome.tabCapture.getCapturedTabs(function (tabs) {
            if (audioStream != null) {
                console.log("stopping capture");
                var tracks = audioStream.getTracks();
                tracks.forEach(function(track) {
                    track.stop();
                });
                chrome.browserAction.setIcon({path:"icon.png"});
                audioStream = null;
                if (activeTab == tab.id) {
                    activeTab = -1;
                    return;   
                }
            };
            console.log("capturing");
            chrome.tabCapture.capture({'audio':true, 'video':false}, function(stream) {
                audioStream = stream;
                chrome.browserAction.setIcon({path:"playing.png"});
                activeTab = tab.id;
            });
        });
    })})();
