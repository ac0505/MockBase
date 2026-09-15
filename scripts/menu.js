(() => {
    const navbar = document.getElementById('main-navbar');
    const toggle = navbar.querySelector('.navbar-toggle');
    const navLinks = document.getElementById('navbar-links');

    toggle.addEventListener('click', () => {
        const isOpen = navLinks.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', String(isOpen));
        toggle.setAttribute('title', isOpen ? 'Close navigation' : 'Open navigation');
    });

    // Set active class dynamically based on path
    const currentPath = window.location.pathname;
    const links = navbar.querySelectorAll('.navbar-link');
    links.forEach(link => {
        const href = link.getAttribute('href');
        if (href === currentPath || currentPath.startsWith(`${href}/`) || (currentPath === '/' && href === '/dashboard')) {
            link.classList.add('active');
            link.setAttribute('aria-current', 'page');
        } else {
            link.classList.remove('active');
            link.removeAttribute('aria-current');
        }
    });

    // Logout button
    const logoutBtn = document.getElementById('logout-btn');
    logoutBtn.addEventListener('click', () => {
        window.location.href = '/login';
    });
})();