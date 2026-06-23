(function () {
  const QUOTES = [
    "I'm going to make you an offer you can't refuse: head back to the homepage.", // The Godfather
    "Toto, I've a feeling we're not on the homepage anymore.",                     // The Wizard of Oz
    "These aren't the pages you're looking for. Move along — to the homepage.",    // Star Wars
    "Houston, we have a problem. This page doesn't exist.",                        // Apollo 13
    "You're gonna need a bigger URL.",                                             // Jaws
    "404, phone home.",                                                            // E.T.
    "Of all the pages on all the websites, you wandered into this empty one.",     // Casablanca
    "Frankly, my dear, this page doesn't exist.",                                  // Gone with the Wind
    "I see dead links.",                                                           // The Sixth Sense
    "You shall not pass! ...but the homepage is right this way.",                  // The Lord of the Rings
    "Where we're going, we don't need this page. The homepage awaits.",            // Back to the Future
    "No one can be told where this page is. Mostly because it isn't here.",        // The Matrix
    "Life is like a box of links — sometimes you get a 404.",                      // Forrest Gump
    "This page won't be back. You can be, though — hit the homepage.",             // The Terminator
    "Why so lost? Let's get you back to the homepage.",                            // The Dark Knight
  ];
  const el = document.getElementById("errorQuote");
  if (el) el.textContent = QUOTES[Math.floor(Math.random() * QUOTES.length)];
})();
