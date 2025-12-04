const input = document.getElementById("textInput");
const charCount = document.getElementById("charCount");

const updateCount = () => {
    const value = input.value;
    charCount.textContent = value.length.toString();
};

input.addEventListener("input", updateCount);
updateCount();
