Project Description
MovieKnight is a web-based, gamified movie organizer and selection application designed to solve "decision paralysis" when choosing what to watch. It allows users to browse movies, organize them into collections, and use interactive tools like "Spin the Wheel" to randomly select a movie based on specific filters (genres, local streaming providers).

Current Tech Stack

Frontend: Vanilla HTML5, CSS3, JavaScript (ES6+).

Data Handling: Asynchronous fetch API pulling from local JSON structures (movies.json, collections.json).

Storage: Browser localStorage for session/auth mocking and state management.

Core Architecture & Features Built

App Shell & Layout (common.css, common.js):

Fully responsive layout with a sticky sidebar navigation and a mobile-friendly hamburger drawer.

Shared authentication widget (mocked via localStorage) with a profile dropdown.

Global modal system (e.g., Sign Out confirmation) and custom scrollbar styling.

Home/Explore Interface (index.html, home.js):

Advanced filter UI for Release Year, Genres, Ratings, Actors, Directors, Age Rating, and Platforms.

"Surprise Me" dice functionality and placeholder AI search mode.

Profile & Collections (profile.html, profile.js):

Asynchronous loading of user collections with CSS skeleton loading states.

Dynamic 3-dots context menu for collection management (Rename, Publish/Unpublish, Copy Link, Delete).

Movie Picker Hub (picker.html, picker.js, picker.css):

Generic configuration funnel for selection tools.

Interactive genre grid with CSS-drawn state animations (turning + to ×).

Live-searchable provider list featuring custom SVG checkboxes and scrollable lists.

Spin The Wheel (wheel.html, wheel.js, wheel.css):

HTML5 <canvas> integration dynamically drawing roulette slices based on data.

Physics-based spin animation using CSS transitions.

Side-by-side editable movie list UI.

Utility Modules (toast.js): Custom, theme-matched notification system replacing default browser alerts.

Development Roadmap (TODO List)
This roadmap is broken down from immediate frontend polish to advanced backend integration.

Phase 1: Wiring the Frontend Logic (Immediate Next Steps)
Currently, the UI looks great, but the pages don't talk to each other.

[ ] Step 1: Pass Configuration Data: In picker.js, when "GENERATE WHEEL" is clicked, save the selected genres and providers to sessionStorage or localStorage before redirecting to wheel.html.

[ ] Step 2: Read Configuration Data: In wheel.js, read that saved data and filter the movies.json fetch so the wheel only displays movies that match the user's selected genres and platforms.

[ ] Step 3: Wheel Spin Resolution: Update the setTimeout in wheel.js to calculate exactly which slice is at the top (the pointer) when the rotation stops, and trigger a toast.success announcing the winning movie.

[ ] Step 4: Collection Menu Actions: Wire up the stubs in profile.js so clicking "Delete Collection" actually removes the item from the DOM, and "Copy Link" copies a dummy URL to the user's clipboard.

Phase 2: Building the Missing Selection Tools
[ ] Step 1: The Chopping Block (chopping.html): Design and build the UI where users are presented with two movies at a time and must eliminate one until only a single winner remains.

[ ] Step 2: Let AI Choose (ai.html): Build a chat-like interface or a slot-machine-style generator where the user types a prompt ("I want a scary movie set in space") and the UI returns a specific recommendation.

Phase 3: Data Architecture & Backend Setup
To move beyond hardcoded JSON files, the app needs a real server.

[ ] Step 1: Choose a Backend Framework: Decide between Node.js (Express), Python (Django/Flask), or a BaaS like Firebase/Supabase.

[ ] Step 2: Database Schema Design: Map out the database tables/collections (e.g., Users, Movies, Collections, Collection_Movies).

[ ] Step 3: Real Authentication: Replace the fake localStorage login with secure JWT (JSON Web Tokens) or OAuth (Google/GitHub login).

[ ] Step 4: Build RESTful APIs: Create the backend endpoints for your frontend to consume (e.g., GET /api/collections, POST /api/collections/new).

Phase 4: External API Integration
Maintaining your own movie database is impossible; you need to pull live data.

[ ] Step 1: TMDB/OMDB Integration: Register for a free API key from The Movie Database (TMDB).

[ ] Step 2: Dynamic Search: Wire the search bar on the home page to query the TMDB API so users can search any movie in the world.

[ ] Step 3: Provider API: Use the TMDB "Watch Providers" endpoint to accurately show which streaming services currently have the movie in the user's specific region.

Phase 5: AI Integration (The "Knight" in MovieKnight)
[ ] Step 1: LLM Setup: Connect your backend to an AI API (like Google Gemini or OpenAI).

[ ] Step 2: Prompt Engineering: Design the system prompts so the AI understands how to take a user's mood ("Feeling sad, want to laugh") and query your movie database to return 3 highly specific recommendations.

[ ] Step 3: Connect to UI: Wire the "AI Mode" button on the home page and the "Let AI Choose" tab to this new endpoint.
