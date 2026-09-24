const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const payloadPreset = document.getElementById("payloadPreset");
const loadPayloadBtn = document.getElementById("loadPayloadBtn");
const safeBtn = document.getElementById("safeBtn");
const unsafeBtn = document.getElementById("unsafeBtn");
const safeResult = document.getElementById("safeResult");
const unsafeResult = document.getElementById("unsafeResult");
const searchTermInput = document.getElementById("searchTerm");
const searchBtn = document.getElementById("searchBtn");
const safeSearchResult = document.getElementById("safeSearchResult");
const unsafeSearchResult = document.getElementById("unsafeSearchResult");

function applyPayload() {
  const selected = payloadPreset.value;

  if (selected === "alice") {
    usernameInput.value = "alice";
    passwordInput.value = "pw123";
    return;
  }

  usernameInput.value = selected;
  passwordInput.value = "anything' OR '1'='1";
}

loadPayloadBtn.addEventListener("click", applyPayload);

async function runLogin(mode) {
  try {
    const response = await fetch("/api/login-demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode,
        username: usernameInput.value,
        password: passwordInput.value,
      }),
    });

    const data = await response.json();

    if (mode === "safe") {
      safeResult.textContent = JSON.stringify(data, null, 2);
      unsafeResult.textContent = "Not run";
      return;
    }

    unsafeResult.textContent = JSON.stringify(data, null, 2);
    safeResult.textContent = "Not run";
  } catch (error) {
    const output = { error: error.message };

    if (mode === "safe") {
      safeResult.textContent = JSON.stringify(output, null, 2);
    } else {
      unsafeResult.textContent = JSON.stringify(output, null, 2);
    }
  }
}

safeBtn.addEventListener("click", () => runLogin("safe"));
unsafeBtn.addEventListener("click", () => runLogin("vulnerable"));

async function runSearchComparison() {
  try {
    const response = await fetch(
      `/api/search-demo?term=${encodeURIComponent(searchTermInput.value)}`,
    );
    const data = await response.json();

    safeSearchResult.textContent = JSON.stringify(data.safe, null, 2);
    unsafeSearchResult.textContent = JSON.stringify(data.unsafe, null, 2);
  } catch (error) {
    safeSearchResult.textContent = JSON.stringify(
      { error: error.message },
      null,
      2,
    );
    unsafeSearchResult.textContent = JSON.stringify(
      { error: error.message },
      null,
      2,
    );
  }
}

searchBtn.addEventListener("click", runSearchComparison);
applyPayload();
