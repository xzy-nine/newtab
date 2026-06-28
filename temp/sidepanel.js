const iframe = document.getElementById("webview");
const urlInput = document.getElementById("urlInput");
const goButton = document.getElementById("go");
// ç›‘å¬å­˜å‚¨å˜åŒ–
chrome.storage.onChanged.addListener((changes) => {
  if (changes.currentUrl) {
    // document.getElementById('webview').src = changes.currentUrl.newValue;
    // iframe.style.display = 'block';
    // urlInput.value = changes.currentUrl.newValue;
    go(changes.currentUrl.newValue);
  }
});

// åˆå§‹åŒ–åŠ è½½
chrome.storage.local.get("currentUrl", ({ currentUrl }) => {
  console.log("currentUrl", currentUrl);
  if (currentUrl) {
    console.log("hide input");
    iframe.src = currentUrl;
    iframe.style.display = "block";
    // urlInput.style.display = 'none'
    urlInput.value = currentUrl;
    iframe.style.display = "block";
  } else {
    console.log("hide iframe");
    iframe.style.display = "none";
  }
});

urlInput.addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    console.log("Enter key pressed");
    // Place your custom code here
    const url = event.target.value;
    if (url) {
      iframe.src = url;
      iframe.style.display = "block";
      // urlInput.style.display = 'none';
      // urlInput.style.visibility = 'hidden';
    }
  }
});

urlInput.addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    console.log("Enter key pressed");
    // Place your custom code here
    const url = event.target.value;
    go(url);
  }
});

goButton.addEventListener("click", () => {
  go(urlInput.value);
});

async function go(url) {
  if (url) {
    const startWithHttp = url.indexOf("http") === 0;
    console.log("start with http: ", startWithHttp);
    if (startWithHttp) {
      console.log(url, url.includes("://"));
      url = url.includes("://") ? url : `https://${url}`;
      url = url.replace("http:", "https:");
      console.log(url);
    } else {
      url = "https://" + url;
    }
    iframe.src = url;
    iframe.style.display = "block";
    urlInput.value = url;
    // urlInput.style.display = 'none';
    // urlInput.style.visibility = 'hidden';
  }
}

function isLikelyUrl(input) {
  // å¦‚æžœè¾“å…¥åŒ…å«ç©ºæ ¼ï¼Œåˆ™å¾ˆå¯èƒ½æ˜¯æœç´¢è¯
  if (!input) {
    return false;
  }

  const startWithHttp = input.indexOf("http") === 0;
  console.log("start with http: ", startWithHttp);
  if (startWithHttp) {
    input = input.includes("://") ? input : `https://${input}`;
    input = input.replace(/^(http:\/\/)?/, "https://");
  } else {
    input = "https://" + input;
  }

  try {
    // ç›´æŽ¥å°è¯•æž„é€  URL å¯¹è±¡ï¼ˆè¾“å…¥å¯èƒ½å·²ç»å¸¦æœ‰åè®®ï¼‰
    new URL(input);
    console.log(new URL(input));
    return input;
  } catch {
    return false;

    // try {
    //     new URL("https://" + input);
    //     return true;
    // } catch (e2) {
    //     return false;
    // }
  }
}

// ç¤ºä¾‹æµ‹è¯•
console.log(isLikelyUrl("https://www.google.com")); // true
console.log(isLikelyUrl("www.google.com")); // true
console.log(isLikelyUrl("google")); // false
console.log(isLikelyUrl("hello world")); // false

document.addEventListener("DOMContentLoaded", async () => {
  urlInput.placeholder = chrome.i18n.getMessage("urlInputPlaceholder");
});
