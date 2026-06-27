// login + signup forms, wired to the real auth API (window.MovieAPI).

function setLoading(submitBtn, isLoading, message) {
  if (!submitBtn) return;
  submitBtn.disabled = isLoading;

  let line = submitBtn.parentElement.querySelector(".form-loading");
  if (!line) {
    line = document.createElement("p");
    line.className = "form-loading";
    line.setAttribute("role", "status");
    line.setAttribute("aria-live", "polite");
    submitBtn.insertAdjacentElement("afterend", line);
  }

  if (isLoading) {
    line.textContent = message;
    line.classList.add("show");
  } else {
    line.classList.remove("show");
  }
}

function makeShowError(errorMsg) {
  return (msg) => {
    errorMsg.textContent = msg;
    errorMsg.classList.add("show");
    toast.error(msg);
  };
}

// touch devices get a "DD / MM / YYYY" text mask instead of the native date picker.
// either way readDobIso normalises to ISO on submit.
function setupMobileDob(dobInput) {
  if (!dobInput) return;
  const isTouch = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  if (!isTouch) return;

  dobInput.type = "text";
  dobInput.setAttribute("inputmode", "numeric");
  dobInput.setAttribute("autocomplete", "bday");
  dobInput.placeholder = "DD / MM / YYYY";
  dobInput.maxLength = 14;

  dobInput.addEventListener("input", () => {
    const digits = dobInput.value.replace(/\D/g, "").slice(0, 8);
    const parts = [];
    if (digits.length) parts.push(digits.slice(0, 2));
    if (digits.length > 2) parts.push(digits.slice(2, 4));
    if (digits.length > 4) parts.push(digits.slice(4, 8));
    dobInput.value = parts.join(" / ");
  });
}

// ISO "YYYY-MM-DD" from native date input or mobile mask. "" if incomplete.
function readDobIso(dobInput) {
  if (!dobInput) return "";
  if (dobInput.type === "date") return dobInput.value;
  const digits = dobInput.value.replace(/\D/g, "");
  if (digits.length !== 8) return "";
  const dd = digits.slice(0, 2), mm = digits.slice(2, 4), yyyy = digits.slice(4, 8);
  return `${yyyy}-${mm}-${dd}`;
}

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginForm");

  if (loginForm) {
    const usernameInput = document.getElementById("loginUsername"); // email or username
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
      // mirror the server's minimum for instant feedback
      if (passwordInput.value.length < 6) {
        passwordInput.classList.add("input-error");
        confirmPasswordInput.classList.add("input-error");
        return showError("Password must be at least 6 characters.");
      }

      // mobile mask can be partially typed and still pass the empty check, so verify full date
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
          dateOfBirth: dobIso,
          email: emailInput.value.trim(),
          username: usernameInput.value.trim(),
          password: passwordInput.value,
        });
        toast.success("Account created! Welcome to MovieKnight.");
        window.location.href = "profile.html";
      } catch (err) {
        const msg = err.message || "Could not create your account.";
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

function continueAsGuest(e) {
  e.preventDefault();
  // clear any saved login + JWT before browsing as a guest
  if (window.MovieAPI) MovieAPI.logout();
  else {
    localStorage.removeItem("currentUser");
    localStorage.removeItem("authToken");
  }
  window.location.href = "index.html";
}
