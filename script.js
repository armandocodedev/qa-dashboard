const GA_MEASUREMENT_ID = 'G-4DPCVB9L73';
const ANALYTICS_CONSENT_KEY = 'qa-dashboard-analytics-consent';

function loadGoogleAnalytics() {
  if (window.gtagLoaded) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);

  window.gtag('js', new Date());
  window.gtag('config', GA_MEASUREMENT_ID);
  window.gtagLoaded = true;
}

function setAnalyticsConsent(choice) {
  localStorage.setItem(ANALYTICS_CONSENT_KEY, choice);
  document.querySelector('.cookie-banner')?.setAttribute('hidden', '');

  if (choice === 'accepted') {
    loadGoogleAnalytics();
  }
}

function initAnalyticsConsent() {
  const savedChoice = localStorage.getItem(ANALYTICS_CONSENT_KEY);
  const banner = document.querySelector('.cookie-banner');

  if (savedChoice === 'accepted') {
    loadGoogleAnalytics();
  } else if (!savedChoice && banner) {
    banner.removeAttribute('hidden');
  }

  document.querySelectorAll('[data-cookie-choice]').forEach(button => {
    button.addEventListener('click', () => {
      setAnalyticsConsent(button.dataset.cookieChoice);
    });
  });

  document.querySelectorAll('[data-reset-cookie-choice]').forEach(button => {
    button.addEventListener('click', () => {
      localStorage.removeItem(ANALYTICS_CONSENT_KEY);
      banner?.removeAttribute('hidden');
    });
  });
}

document.addEventListener('DOMContentLoaded', initAnalyticsConsent);
