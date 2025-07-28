# Nebula Browser Themes

This directory contains theme files for the Nebula Browser customization system.

## Theme Structure

Each theme is a JSON file with the following structure:

```json
{
  "name": "Theme Name",
  "colors": {
    "bg": "#121418",
    "darkBlue": "#0B1C2B", 
    "darkPurple": "#1B1035",
    "primary": "#7B2EFF",
    "accent": "#00C6FF",
    "text": "#E0E0E0"
  },
  "layout": "centered",
  "showLogo": true,
  "customTitle": "Nebula Browser",
  "gradient": "linear-gradient(145deg, #121418 0%, #1B1035 100%)",
  "version": "1.0",
  "description": "Theme description"
}
```

## Color Properties

- `bg`: Main background color
- `darkBlue`: Secondary dark blue accent
- `darkPurple`: Secondary dark purple accent  
- `primary`: Primary accent color (used for buttons, logos)
- `accent`: Secondary accent color (used for highlights)
- `text`: Main text color

## Layout Options

- `centered`: Default centered layout
- `sidebar`: Sidebar navigation layout
- `compact`: Compact view layout

## Directories

- `/downloaded/`: Themes downloaded from the community
- `/user/`: User-created custom themes

## Usage

1. **Import Theme**: Go to Settings > Customization > Import Theme
2. **Export Theme**: Create your custom theme and export it
3. **Share Themes**: Share your exported .json files with other users

## Creating Custom Themes

1. Go to Settings > Browser Customization
2. Adjust colors and settings using the controls
3. Use the live preview to see changes
4. Save as custom theme or export to share

## Community Themes

Place downloaded community themes in the `/downloaded/` folder. The browser will automatically detect and make them available in the theme selector.

## Non-Destructive Design

All theme changes are stored separately and can be reset to default at any time. Your customizations never modify the original browser files.
