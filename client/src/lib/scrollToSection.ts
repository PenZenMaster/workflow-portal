// Pure client-side scroll navigation - never touches window.location, so it
// works regardless of routing. Needed because wouter's useHashLocation
// (this app's router) rules out URL-hash anchor navigation for in-page
// jumps: a "#section-id" href would be interpreted as a route change, not
// a scroll target.
export function scrollToSection(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}
