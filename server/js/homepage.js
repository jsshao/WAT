window.addEventListener('load', function() {
    var code = 0;
    document.getElementById("submit").addEventListener("click", function(){
        inputBox = document.getElementById("code");
        code = inputBox.value;
        console.log(code);
        //handle this and show "Loading" or provide error message if connection failed"
        this.innerHTML = "LOADING";
        inputBox.disabled = true;
    });

    document.addEventListener('keypress', function(evt) {
        evt = evt || window.event;
        // Check for <enter> key
        if (evt.keyCode == 13) {
            evt.preventDefault();
            document.getElementById('submit').click()
        }
    });
});
