window.addEventListener('load', function() {
    var code = 0;
    document.getElementById("submit").addEventListener("click", function(){
        inputBox = document.getElementById("code");
        code = inputBox.value;
        console.log(code);
        //handle this and show "Loading" or provide error message if connection failed"
        this.innerHTML = "LOADING";
        inputBox.disabled = true;
        this.style.pointerEvents = 'none';
    });

    document.addEventListener('keypress', function(evt) {
        evt = evt || window.event;
        // Check for <enter> key
        if (evt.keyCode == 13) {
            evt.preventDefault();
            document.getElementById('submit').click()
        }
    });

    document.getElementById("help").addEventListener("click", function() {
        if (confirm("Click OK to download the Chrome Extension and follow instructions")) {
            window.location.href='https://chrome.google.com/webstore/detail/wat/agiccfedafoadleabfjjoepofialejfg';
        }
    });
});
