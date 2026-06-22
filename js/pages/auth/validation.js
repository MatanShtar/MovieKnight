// validation.js — login + signup forms, wired to the real auth API (window.MovieAPI).
//
// Replaces the old admin/1234 mock: credentials are now verified by the server,
// which hashes passwords (bcrypt) and returns a JWT that MovieAPI stores in
// localStorage. All feedback is in-page (inline message + toast) — never
// alert/confirm/prompt — and submits show a loading state.

// Greys out the submit button (unclickable) and shows a status line BENEATH it
// while a request is in flight. The button label is left unchanged (the pill is
// too narrow for "Creating account…"). Call with isLoading:false to restore.
function setLoading(submitBtn, isLoading, message) {
  if (!submitBtn) return;
  submitBtn.disabled = isLoading;

  let line = submitBtn.parentElement.querySelector(".form-loading");
  if (!line) {
    line = document.createElement("p");
    line.className = "form-loading";
    line.setAttribute("role", "status");
    line.setAttribute("aria-live", "polite");
    submitBtn.insertAdjacentElement("afterend", line); // beneath the button
  }

  if (isLoading) {
    line.textContent = message;
    line.classList.add("show");
  } else {
    line.classList.remove("show");
  }
}

// Builds a showError(msg) for a given inline error element: reveals the inline
// message and mirrors it as a toast. Shared by both the login and signup forms.
function makeShowError(errorMsg) {
  return (msg) => {
    errorMsg.textContent = msg;
    errorMsg.classList.add("show");
    toast.error(msg);
  };
}

// On touch devices the native <input type="date"> renders as an oversized, often
// blank control that pops the OS calendar — jarring next to the other fields. There
// we swap it for a plain text field with a "DD / MM / YYYY" mask so it matches the
// rest of the form (and the desktop layout). Desktop keeps the native date picker.
// Either way the value is normalised to ISO "YYYY-MM-DD" on submit (see readDobIso).
function setupMobileDob(dobInput) {
  if (!dobInput) return;
  const isTouch = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  if (!isTouch) return;

  dobInput.type = "text";
  dobInput.setAttribute("inputmode", "numeric");
  dobInput.setAttribute("autocomplete", "bday");
  dobInput.placeholder = "DD / MM / YYYY";
  dobInput.maxLength = 14; // "DD / MM / YYYY"

  // Auto-format the digits into "DD / MM / YYYY" as the user types.
  dobInput.addEventListener("input", () => {
    const digits = dobInput.value.replace(/\D/g, "").slice(0, 8);
    const parts = [];
    if (digits.length) parts.push(digits.slice(0, 2));
    if (digits.length > 2) parts.push(digits.slice(2, 4));
    if (digits.length > 4) parts.push(digits.slice(4, 8));
    dobInput.value = parts.join(" / ");
  });
}

// The ISO "YYYY-MM-DD" the server expects, read from either the native date input
// (already ISO) or the mobile "DD / MM / YYYY" text mask. Returns "" when it isn't a
// complete date so the caller can flag it.
function readDobIso(dobInput) {
  if (!dobInput) return "";
  if (dobInput.type === "date") return dobInput.value; // native → already ISO
  const digits = dobInput.value.replace(/\D/g, "");
  if (digits.length !== 8) return "";
  const dd = digits.slice(0, 2), mm = digits.slice(2, 4), yyyy = digits.slice(4, 8);
  return `${yyyy}-${mm}-${dd}`;
}

document.addEventListener("DOMContentLoaded", () => {
  // ==========================================
  // 1. LOGIN
  // ==========================================
  const loginForm = document.getElementById("loginForm");

  if (loginForm) {
    const usernameInput = document.getElementById("loginUsername"); // email OR username
    const passwordInput = document.getElementById("loginPassword");
    const errorMsg = document.getElementById("loginErrorMsg");
    const submitBtn = loginForm.querySelector(".submit-btn");

    const showError = makeShowError(errorMsg);

    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();

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
      if (hasError) return showError("Please fill in all required fields.");

      if (!window.MovieAPI) {
        return showError("Login is unavailable right now. Please try again later.");
      }

      // Loading state — grey out the button (unclickable) + status line beneath it.
      setLoading(submitBtn, true, "Logging in…");

      try {
        await MovieAPI.login(usernameInput.value.trim(), passwordInput.value);
        window.location.href = "index.html";
      } catch (err) {
        usernameInput.classList.add("input-error");
        passwordInput.classList.add("input-error");
        showError(err.message || "Incorrect email or password.");
        setLoading(submitBtn, false);
      }
    });

    [usernameInput, passwordInput].forEach((input) => {
      input.addEventListener("input", () => {
        input.classList.remove("input-error");
        errorMsg.classList.remove("show");
      });
    });
  }

  // ==========================================
  // 2. SIGNUP
  // ==========================================
  const signupForm = document.getElementById("signupForm");

  if (signupForm) {
    const nameInput = document.getElementById("signupName");
    const dobInput = document.getElementById("signupDob");
    const emailInput = document.getElementById("signupEmail");
    const usernameInput = document.getElementById("signupUsername");
    const passwordInput = document.getElementById("signupPassword");
    const confirmPasswordInput = document.getElementById("signupConfirmPassword");
    const errorMsg = document.getElementById("signupErrorMsg");
    const submitBtn = signupForm.querySelector(".submit-btn");

    // Touch devices get a masked text field instead of the native calendar.
    setupMobileDob(dobInput);

    const allInputs = [
      nameInput,
      dobInput,
      emailInput,
      usernameInput,
      passwordInput,
      confirmPasswordInput,
    ];

    const showError = makeShowError(errorMsg);

    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      allInputs.forEach((input) => input.classList.remove("input-error"));
      errorMsg.classList.remove("show");

      let hasError = false;
      allInputs.forEach((input) => {
        if (!input.value.trim()) {
          input.classList.add("input-error");
          hasError = true;
        }
      });
      if (hasError) return showError("Please fill in all required fields.");

      if (passwordInput.value !== confirmPasswordInput.value) {
        passwordInput.classList.add("input-error");
        confirmPasswordInput.classList.add("input-error");
        return showError("Passwords do not match.");
      }
      // Match the server's minimum so the user gets instant feedback.
      if (passwordInput.value.length < 6) {
        passwordInput.classList.add("input-error");
        confirmPasswordInput.classList.add("input-error");
        return showError("Password must be at least 6 characters.");
      }

      // Normalise the DOB to ISO. On mobile the masked field can be partially typed
      // and still pass the empty-field check, so verify it's a full date here.
      const dobIso = readDobIso(dobInput);
      if (!dobIso) {
        dobInput.classList.add("input-error");
        return showError("Please enter your date of birth as DD / MM / YYYY.");
      }

      if (!window.MovieAPI) {
        return showError("Sign up is unavailable right now. Please try again later.");
      }

      setLoading(submitBtn, true, "Creating account…");

      try {
        await MovieAPI.signup({
          name: nameInput.value.trim(),
          dateOfBirth: dobIso, // ISO "YYYY-MM-DD" (native date input or mobile mask)
          email: emailInput.value.trim(),
          username: usernameInput.value.trim(),
          password: passwordInput.value,
        });
        toast.success("Account created! Welcome to MovieKnight.");
        window.location.href = "profile.html";
      } catch (err) {
        const msg = err.message || "Could not create your account.";
        // Highlight the field the server complained about, when we can tell.
        const lower = msg.toLowerCase();
        if (lower.includes("email")) emailInput.classList.add("input-error");
        if (lower.includes("username")) usernameInput.classList.add("input-error");
        showError(msg);
        setLoading(submitBtn, false);
      }
    });

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
  // Clear any saved login + JWT before browsing as a guest.
  if (window.MovieAPI) MovieAPI.logout();
  else {
    localStorage.removeItem("currentUser");
    localStorage.removeItem("authToken");
  }
  window.location.href = "index.html";
}
