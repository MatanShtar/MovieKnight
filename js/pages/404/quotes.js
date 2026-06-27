(function () {
  const QUOTES = [
    "I'm going to make you an offer you can't refuse: head back to the homepage.",
    "Toto, I've a feeling we're not on the homepage anymore.",
    "These aren't the pages you're looking for. Move along — to the homepage.",
    "Houston, we have a problem. This page doesn't exist.",
    "You're gonna need a bigger URL.",
    "404, phone home.",
    "Of all the pages on all the websites, you wandered into this empty one.",
    "Frankly, my dear, this page doesn't exist.",
    "I see dead links.",
    "You shall not pass! ...but the homepage is right this way.",
    "Where we're going, we don't need this page. The homepage awaits.",
    "No one can be told where this page is. Mostly because it isn't here.",
    "Life is like a box of links — sometimes you get a 404.",
    "This page won't be back. You can be, though — hit the homepage.",
    "Why so lost? Let's get you back to the homepage.",
  ];
  const el = document.getElementById("errorQuote");
  if (el) el.textContent = QUOTES[Math.floor(Math.random() * QUOTES.length)];
})();
