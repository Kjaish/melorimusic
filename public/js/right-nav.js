// Right-side navigation specific functionality
class RightNav {
    constructor() {
        this.isOpen = false;
        this.init();
    }
    
    init() {
        // Close nav when clicking outside
        document.addEventListener('click', (e) => {
            const nav = document.getElementById('nav-overlay');
            const toggle = document.querySelector('.menu-toggle');
            
            if (this.isOpen && 
                nav && toggle &&
                !nav.contains(e.target) && 
                !toggle.contains(e.target)) {
                this.close();
            }
        });
        
        // Keyboard escape to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });
    }
    
    open() {
        const nav = document.getElementById('nav-overlay');
        const backdrop = document.getElementById('navBackdrop');
        
        if (nav) {
            nav.classList.add('active');
            if (backdrop) backdrop.classList.add('active');
            document.body.style.overflow = 'hidden';
            this.isOpen = true;
            
            // Add animation class with staggered delay
            const navItems = document.querySelectorAll('.nav-item');
            navItems.forEach((item, index) => {
                item.style.animationDelay = `${index * 0.05}s`;
                item.classList.add('slide-in');
            });
        }
    }
    
    close() {
        const nav = document.getElementById('nav-overlay');
        const backdrop = document.getElementById('navBackdrop');
        
        if (nav) {
            nav.classList.remove('active');
            if (backdrop) backdrop.classList.remove('active');
            document.body.style.overflow = '';
            this.isOpen = false;
            
            // Remove animation
            document.querySelectorAll('.nav-item').forEach(item => {
                item.classList.remove('slide-in');
            });
        }
    }
    
    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }
}

// Initialize navigation
const rightNav = new RightNav();
window.rightNav = rightNav;

// Override global functions
window.openNav = () => rightNav.open();
window.closeNav = () => rightNav.close();
