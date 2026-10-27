const loginForm = document.querySelector("#login-form");
const loginError = document.querySelector("#login-error");
const loginButton = loginForm.querySelector("button[type=submit]");
const passwordInput = document.querySelector("#password");
const passwordToggle = document.querySelector("#password-toggle");

passwordToggle.addEventListener("click", () => {
  const showPassword = passwordInput.type === "password";
  passwordInput.type = showPassword ? "text" : "password";
  passwordToggle.textContent = showPassword ? "Hide" : "Show";
  passwordToggle.setAttribute("aria-label", `${showPassword ? "Hide" : "Show"} password`);
  passwordToggle.setAttribute("aria-pressed", String(showPassword));
});

if (new URLSearchParams(location.search).has("server")) {
  loginError.textContent =
    "The admin panel needs the BEA Node server. Start it using the instructions in README.md, then open the server address.";
  loginError.hidden = false;
} else {
  fetch("/api/session", { cache: "no-store" })
    .then((response) => response.json())
    .then((session) => {
      if (session.authenticated) location.replace("admin.html");
    })
    .catch(() => {
      loginError.textContent =
        "Start the BEA Node server, then open the admin page from its address.";
      loginError.hidden = false;
    });
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.hidden = true;
  loginButton.disabled = true;

  const formData = new FormData(loginForm);
  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: formData.get("username"),
        password: formData.get("password"),
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Sign in could not be completed.");
    location.assign("admin.html");
  } catch (error) {
    loginError.textContent = error.message.includes("Failed to fetch")
      ? "Start the BEA site server, then open this page from its address."
      : error.message;
    loginError.hidden = false;
    loginButton.disabled = false;
  }
});
