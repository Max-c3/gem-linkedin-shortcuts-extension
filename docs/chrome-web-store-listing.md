# Chrome Web Store Listing Copy

Use this text when creating/updating the store listing.

## Name
Gem LinkedIn Shortcuts

## Short description
Run Gem and Ashby recruiting actions directly from supported recruiting profile pages.

## Detailed description
Gem LinkedIn Shortcuts helps recruiting teams move faster from LinkedIn, Gem candidate, and GitHub profile pages.

From a supported profile page, team members can use keyboard shortcuts or popup actions to:
- Add candidate/prospect records to Gem
- Add candidates to Gem projects
- Open candidate profiles in Gem or Ashby
- Upload candidates to Ashby for selected jobs
- Add notes, reminders, and manage candidate emails
- Open or edit sequences in Gem
- Search Gem people/projects and create Gem projects

How it works:
- The extension runs only on supported LinkedIn, Gem candidate, and GitHub pages.
- Requests go to your organization's hosted backend service.
- Backend routes are allowlisted for specific recruiting actions.
- Gem/Ashby API keys stay on the backend, not in the browser.
- Chrome Web Store builds should not bundle backend shared secrets.

This extension is intended for internal recruiting workflows.

## Single purpose statement
Enable internal recruiting teams to execute Gem and Ashby candidate workflows from supported recruiting profile pages with keyboard shortcuts.

## Permission justifications
- storage: Saves per-user extension settings and shortcut preferences.
- Site access (linkedin.com, gem.com, app.gem.com, github.com): Runs content scripts only on supported recruiting profile pages where user-triggered actions begin.
- Host permissions (organization backend domain): Sends action requests to the hosted backend API.
