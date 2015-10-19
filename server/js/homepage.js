window.addEventListener('load', function() {
    var code = 0;
    document.getElementById("submit").addEventListener("click", function(){
        inputBox = document.getElementById("code");
        code = inputBox.value;
        console.log(code);
        //handle this and show "Connected" or provide error message if connection failed"
        this.innerHTML = "CONNECTED";
        inputBox.disabled = true;
    });
});
