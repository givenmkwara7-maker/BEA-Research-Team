const loginForm = document.querySelector("#login-form");
const loginError = document.querySelector("#login-error");
const loginButton = loginForm.querySelector("button[type=submit]");

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
