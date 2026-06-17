document.addEventListener("DOMContentLoaded", () => {
  // ==========================================
  // 1. LOGIN VALIDATION
  // ==========================================
  const loginForm = document.getElementById("loginForm");

  if (loginForm) {
    const usernameInput = document.getElementById("loginUsername");
    const passwordInput = document.getElementById("loginPassword");
    const errorMsg = document.getElementById("loginErrorMsg");

    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();

      // Reset states
      usernameInput.classList.remove("input-error");
      passwordInput.classList.remove("input-error");
      errorMsg.classList.remove("show");

      let hasError = false;

      if (!usernameInput.value.trim()) {
        usernameInput.classList.add("input-error");
        hasError = true;
      }
      if (!passwordInput.value.trim()) {
        passwordInput.classList.add("input-error");
        hasError = true;
      }

      if (hasError) {
        errorMsg.textContent = "Please fill in all required fields.";
        errorMsg.classList.add("show");
        toast.error("Please fill in all required fields.");
        return;
      }

      // Mock login check
      if (usernameInput.value !== "admin" || passwordInput.value !== "1234") {
        usernameInput.classList.add("input-error");
        passwordInput.classList.add("input-error");
        errorMsg.textContent = "Incorrect email or password.";
        errorMsg.classList.add("show");
        toast.error("Incorrect email or password.");
      } else {
        // Save the logged-in user
        localStorage.setItem(
          "currentUser",
          JSON.stringify({ username: usernameInput.value }),
        );
        window.location.href = "index.html";
      }
    });

    // Remove red border when user starts typing
    [usernameInput, passwordInput].forEach((input) => {
      input.addEventListener("input", () => {
        input.classList.remove("input-error");
        errorMsg.classList.remove("show");
      });
    });
  }

  // ==========================================
  // 2. SIGNUP VALIDATION
  // ==========================================
  const signupForm = document.getElementById("signupForm");

  if (signupForm) {
    const nameInput = document.getElementById("signupName");
    const dobInput = document.getElementById("signupDob");
    const emailInput = document.getElementById("signupEmail");
    const usernameInput = document.getElementById("signupUsername");
    const passwordInput = document.getElementById("signupPassword");
    const confirmPasswordInput = document.getElementById(
      "signupConfirmPassword",
    );
    const errorMsg = document.getElementById("signupErrorMsg");

    const allInputs = [
      nameInput,
      dobInput,
      emailInput,
      usernameInput,
      passwordInput,
      confirmPasswordInput,
    ];

    signupForm.addEventListener("submit", (e) => {
      e.preventDefault();

      // Reset states
      allInputs.forEach((input) => input.classList.remove("input-error"));
      errorMsg.classList.remove("show");

      let hasError = false;

      // Check for empty fields
      allInputs.forEach((input) => {
        if (!input.value.trim()) {
          input.classList.add("input-error");
          hasError = true;
        }
      });

      if (hasError) {
        errorMsg.textContent = "Please fill in all required fields.";
        errorMsg.classList.add("show");
        toast.error("Please fill in all required fields.");
        return;
      }

      // Check if passwords match
      if (passwordInput.value !== confirmPasswordInput.value) {
        passwordInput.classList.add("input-error");
        confirmPasswordInput.classList.add("input-error");
        errorMsg.textContent = "Passwords do not match.";
        errorMsg.classList.add("show");
        toast.error("Passwords do not match.");
        return;
      }

      // Log the new user in straight away, then go to the home page
      localStorage.setItem(
        "currentUser",
        JSON.stringify({
          username: usernameInput.value,
          name: nameInput.value,
          email: emailInput.value,
        }),
      );
      window.location.href = "index.html";
    });

    // Remove red border when user starts typing
    allInputs.forEach((input) => {
      input.addEventListener("input", () => {
        input.classList.remove("input-error");
        errorMsg.classList.remove("show");
      });
    });
  }
});

// ==========================================
// 3. GUEST MODE NAVIGATION
// ==========================================
function continueAsGuest(e) {
  e.preventDefault();
  localStorage.removeItem("currentUser");
  window.location.href = "index.html";
}
