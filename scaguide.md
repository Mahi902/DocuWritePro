# Sugarcane Add-on (.sca) Creation Guide

Sugarcane add-ons are small packages of web assets that extend **Sugarcane Editor** automatically. A `.sca` file is plain text, so you can create one in any text editor and save it as `.sca`.

## 1. How a `.sca` file works

A `.sca` file contains one or more add-on records. Each record starts with a `name:` line. The following fields belong to that add-on until the next `name:` line appears.

```text
name: My Add-on
icon: https://example.com/icon.png
version: 1.0.0
creator: Your Name
description: A short **Markdown** description of the add-on.
p/html: https://example.com/addon.html
p/css: https://example.com/addon.css
p/js: https://example.com/addon.js
```

The fields are:

| Field | Required | Purpose |
| --- | --- | --- |
| `name` | Yes | Display name of the add-on. It also identifies the add-on when a linked source is checked for updates. |
| `icon` | No | URL to an icon image. |
| `version` | Yes | Version shown in the add-on library. Semantic versions such as `1.2.0` are recommended. |
| `creator` | No | Creator or author name. |
| `description` | No | Markdown description of the add-on. |
| `p/html` | No | URL to an HTML asset. Its markup is inserted into the editor document when the add-on loads. |
| `p/css` | No | URL to a CSS asset. Its stylesheet is loaded automatically. |
| `p/js` | No | URL to a JavaScript asset. Its script is loaded automatically. |

At least one of `p/html`, `p/css`, or `p/js` should normally be supplied. An icon and description are recommended so the library is easy to understand.

## 2. Multiple add-ons in one file

Put another `name:` line after the first add-on's fields. That starts a new add-on record.

```text
name: First Add-on
icon: https://example.com/first.png
version: 1.0.0
creator: Example Creator
description: The first add-on.
p/html: https://example.com/first.html
p/css: https://example.com/first.css
p/js: https://example.com/first.js
name: Second Add-on
icon: https://example.com/second.png
version: 2.0.0
creator: Example Creator
description: The second add-on.
p/html: https://example.com/second.html
p/css: https://example.com/second.css
p/js: https://example.com/second.js
```

A blank line between records is allowed. Do not put another `name:` line inside a description.

## 3. Hosting your add-on

The add-on library can load a `.sca` file from a link ending in `.sca` or `.txt`. The linked file must be reachable by the browser with a normal HTTP(S) request.

For a hosted add-on, a simple layout can look like this:

```text
/addons/
  my-addon.sca
  icon.png
  addon.html
  addon.css
  addon.js
```

Then your `.sca` file can point to those assets:

```text
name: My Add-on
icon: https://example.com/addons/icon.png
version: 1.0.0
creator: Your Name
description: My first Sugarcane extension.
p/html: https://example.com/addons/addon.html
p/css: https://example.com/addons/addon.css
p/js: https://example.com/addons/addon.js
```

Using absolute HTTPS URLs is the safest choice. Relative URLs are not recommended for library entries because the add-on is ultimately loaded by `sceditor.html`.

## 4. HTML, CSS and JavaScript assets

### HTML

`p/html` points to a normal HTML file. Sugarcane loads its contents and inserts the resulting markup into the editor page.

Use unique IDs and class names so your markup does not accidentally collide with Sugarcane's existing interface.

### CSS

`p/css` points to a stylesheet. Keep selectors scoped to your add-on whenever possible:

```css
.sca-my-addon .button {
  border-radius: 10px;
}
```

### JavaScript

`p/js` points to a JavaScript file. The script is loaded automatically after the HTML and CSS assets for that add-on.

JavaScript can add buttons, react to editor events, modify the DOM, and provide new functionality. Because add-on JavaScript runs as part of the page, **only install add-ons you trust**.

## 5. Enabling and disabling add-ons

In **DocuWrite Pro → Settings → Add-ons**, turn on **Apply Add-ons**. Then open **Library** to manage individual add-ons.

Each add-on can be enabled or disabled separately. Disabling the main **Apply Add-ons** setting stops all add-ons from being loaded into Sugarcane Editor.

When the add-on library changes, Sugarcane Editor reloads so JavaScript side effects, stylesheets, and inserted markup are cleanly reverted.

## 6. Add-on versions and updates

The version is taken from the `version:` field. For a linked add-on, the library can fetch the source file again and compare the remote version with the installed version.

Example:

```text
version: 1.4.0
```

Later, publish:

```text
version: 1.5.0
```

The library will report an update when the newer version is detected.

Uploaded `.sca` files do not have a remote update source. To get automatic update checks, install the add-on from a hosted `.sca` or `.txt` link.

## 7. Markdown descriptions

The `description:` field supports Markdown. This makes it useful for short documentation:

```text
description: Adds a **focus mode** button.

- Hides distracting panels
- Restores the layout when turned off
```

Keep descriptions reasonably short because the full text appears in the add-on library.

## 8. A complete starter template

Copy this and replace the values:

```text
name: Your Add-on Name
icon: https://example.com/icon.png
version: 1.0.0
creator: Your Name
description: Describe what the add-on does. **Markdown** is supported.
p/html: https://example.com/addon.html
p/css: https://example.com/addon.css
p/js: https://example.com/addon.js
```

## 9. Checklist before publishing

- Use a clear `name:`.
- Increase the `version:` when you publish a new release.
- Make the `description:` explain what the add-on actually changes.
- Test every `p/html`, `p/css`, and `p/js` URL directly in a browser.
- Use unique CSS classes and IDs.
- Make sure the hosted `.sca`/`.txt` file can be fetched by the browser.
- Test the add-on with **Apply Add-ons** enabled and disabled.
- Only distribute code that you trust and intend users to execute.

## 10. The complete structure

The complete supported structure is:

```text
name: (name)
icon: (icon url)
version: (version of addon)
creator: (creator name)
description: (description written in .md)
p/html: (link to .html file url if any)
p/css: (link to css file url if any)
p/js: (link to js file url if any)
```

After one add-on's final field, start the next record with another `name:` line.
