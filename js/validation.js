// --- THE MOCK DATABASE INITIALIZATION ---
// If no database exists yet, create it and add our placeholder account
if (!localStorage.getItem('usersDB')) {
    const defaultUsers = [
        { 
            name: 'Vova', 
            dob: '2000-01-01', 
            email: 'vova@test.com', 
            username: 'vova2020', 
            password: 'password123' 
        }
    ];
    localStorage.setItem('usersDB', JSON.stringify(defaultUsers));
}

// --- SIGNUP LOGIC ---
const signupForm = document.getElementById('signupForm');

if (signupForm) {
    signupForm.addEventListener('submit', (e) => {
        // Stop the browser from instantly refreshing the page
        e.preventDefault(); 
        
        // 1. Grab all the values the user typed in
        const name = document.getElementById('name').value.trim();
        const dob = document.getElementById('dob').value;
        const email = document.getElementById('email').value.trim();
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirm-password').value;

        // 2. Perform Custom Validations
        if (password !== confirmPassword) {
            alert("Error: Passwords do not match!");
            return; // Stops the function from continuing
        }
        
        if (password.length < 6) {
            alert("Error: Password must be at least 6 characters long.");
            return;
        }

        // 3. Database Checks (Do they already exist?)
        const users = JSON.parse(localStorage.getItem('usersDB'));
        
        const emailExists = users.find(u => u.email === email);
        if (emailExists) {
            alert("Error: An account with that email already exists!");
            return;
        }

        const usernameExists = users.find(u => u.username === username);
        if (usernameExists) {
            alert("Error: That username is already taken!");
            return;
        }

        // 4. Save the New User to the Database
        const newUser = { name, dob, email, username, password };
        users.push(newUser);
        localStorage.setItem('usersDB', JSON.stringify(users));

        // 5. Automatically log them in and send them to the Home Page
        // We only save safe info to the current session (never the password!)
        localStorage.setItem('currentUser', JSON.stringify({ email, username }));
        window.location.href = 'index.html';
    });
}