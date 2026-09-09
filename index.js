const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (request, response) => response.redirect('/dashboard'));
app.get('/dashboard', (request, response) => response.render('dashboard'));
app.get('/search', (request, response) => response.render('search'));
app.get('/exams', (request, response) => response.render('exams'));

app.listen(port, () => {
    console.log(`Exit Exam Tracker running at http://localhost:${port}`);
});
