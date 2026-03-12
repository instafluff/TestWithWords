# .tww File Format

The `.tww` format is how you write tests for TestWithWords. It's a lightweight, indentation-based format inspired by Jest and Mocha — with `describe` blocks, `test` blocks, and lifecycle hooks. The test body is just words — describe what you want to happen.

More examples and patterns at [testwithwords.com](https://testwithwords.com).

---

## Quick Example

```tww
url https://example.com

describe "Example.com"

  test "homepage has correct heading"
    Verify the page heading says "Example Domain"

  test "has a link to more info"
    Click the "More information..." link
    Verify the page navigated to iana.org
```

That's a complete, runnable test file. Two tests, zero code.

---

## Directives

### url

Sets the starting URL for all tests in the file. The AI navigates here before each test.

```tww
url https://myapp.com/dashboard
```

- Must appear at the top (before any `describe` block)
- One `url` per file
- Tests can still navigate elsewhere — this is just the starting point

```tww
# The AI starts at the login page for every test
url https://myapp.com/login

describe "Login Page"

  test "shows the login form"
    Verify email and password fields are visible

  test "can navigate to signup"
    Click the "Create Account" link
    Verify you're on the signup page
```

### describe

Groups related tests together. Takes a quoted name.

```tww
describe "Login Page"

  test "shows login form"
    Verify the email and password fields are visible

  test "rejects invalid credentials"
    Enter "bad@email.com" in the email field
    Enter "wrongpassword" in the password field
    Click the Sign In button
    Verify an error message appears
```

#### Nesting describe blocks

You can nest `describe` blocks to organize tests into sections — just like Jest:

```tww
describe "Dashboard"

  describe "Sidebar"

    test "shows navigation links"
      Verify the sidebar has links for Home, Settings, and Profile

  describe "Main Content"

    test "shows welcome message"
      Verify the page shows "Welcome back"

    test "shows recent activity"
      Verify an activity feed is visible with at least one item
```

### test

A single test scenario. Takes a quoted name. The body is just words — write whatever a person would understand.

```tww
test "can search for products"
  Type "wireless mouse" into the search box
  Press Enter
  Verify search results appear
  Verify at least one result mentions "wireless"
```

Each line is a step the AI performs. You can also write it as a flowing paragraph — the AI figures it out:

```tww
test "checkout flow"
  Add any item to the cart. Go to the cart page.
  Click "Proceed to Checkout". Fill in the shipping
  form with test data. Verify the order summary
  appears with the correct total.
```

One action per line is generally easier to debug, since the report shows exactly which step failed.

### before each

Runs before every test in the enclosing `describe` block. Perfect for repeated setup like logging in:

```tww
describe "User Settings"

  before each
    Navigate to the settings page
    Verify the settings form is visible

  test "can change display name"
    Clear the display name field
    Type "New Name"
    Click Save
    Verify a success message appears

  test "can change email"
    Click the email field
    Clear it and type "new@email.com"
    Click Save
    Verify a confirmation message appears
```

### after each

Runs after every test in the enclosing `describe` block. Great for cleanup:

```tww
describe "Form Tests"

  after each
    Click the Reset button to clear the form

  test "validates required fields"
    Click Submit without filling anything
    Verify error messages appear on required fields

  test "accepts valid input"
    Fill in all required fields with valid data
    Click Submit
    Verify a success message appears
```

### before all

Runs once before all tests in the block. Use for one-time, expensive setup:

```tww
describe "Admin Panel"

  before all
    Navigate to the admin login page
    Sign in with admin credentials

  test "can view user list"
    Click Users in the sidebar
    Verify a table of users appears

  test "can view system settings"
    Click Settings in the sidebar
    Verify the system configuration page loads
```

### after all

Runs once after all tests in the block:

```tww
describe "Data Management"

  after all
    Navigate to settings and delete all test data

  test "can create a record"
    Click New Record
    Fill in the form and save

  test "can edit a record"
    Click on the first record
    Change the name and save
    Verify the updated name appears
```

### use (planned)

Import steps from another `.tww` file. *Not yet implemented* — use `before each` for now.

```tww
# Future syntax:
describe "Dashboard"
  before each
    use "flows/login.tww"

  test "shows activity feed"
    Verify the activity feed is visible
```

### Comments

Lines starting with `#` are comments — ignored by the parser:

```tww
# This file tests the shopping cart
# Last updated: 2024-01-15
url https://shop.example.com

describe "Cart"

  # Basic add-to-cart flow
  test "can add an item"
    Click on the first product
    Click "Add to Cart"
    Verify the cart count is 1
```

---

## Indentation Rules

`.tww` files use **2-space indentation** to show structure, similar to Python:

```tww
describe "Outer"           # 0 spaces
                            
  test "at level 1"        # 2 spaces
    Do something           # 4 spaces
    Verify something       # 4 spaces

  describe "Inner"         # 2 spaces

    test "at level 2"      # 4 spaces
      Do something else    # 6 spaces
```

The rules:

- `describe` blocks at the base level (0 spaces)
- `test`, `before each`, etc. inside a `describe` (2 spaces)
- Test body lines inside a `test` (4 spaces)
- Nested `describe` blocks add another 2 spaces each level

**Important:** Use spaces, not tabs. The parser counts leading spaces to determine nesting.

---

## Common Patterns

These are typical patterns for real-world test scenarios.

### Login Flow

```tww
url https://myapp.com/login

describe "Authentication"

  test "can log in with valid credentials"
    Enter "testuser@example.com" in the email field
    Enter "password123" in the password field
    Click the "Sign In" button
    Verify you're redirected to the dashboard
    Verify a welcome message appears

  test "shows error for invalid credentials"
    Enter "wrong@example.com" in the email field
    Enter "badpassword" in the password field
    Click "Sign In"
    Verify an error message like "Invalid credentials" appears
    Verify you're still on the login page
```

### Form Submission

```tww
url https://myapp.com/contact

describe "Contact Form"

  test "can submit a message"
    Type "Jane Doe" in the Name field
    Type "jane@example.com" in the Email field
    Select "Sales Inquiry" from the Subject dropdown
    Type "I'd like to learn about pricing" in the Message field
    Click the "Send Message" button
    Verify a success message like "Thanks for reaching out" appears

  test "validates required fields"
    Leave all fields empty
    Click "Send Message"
    Verify error messages appear for Name and Email
```

### Multi-Step Checkout

```tww
url https://shop.example.com

describe "Checkout Flow"

  test "can complete a purchase"
    Search for "mechanical keyboard"
    Click the first product
    Click "Add to Cart"
    Click the cart icon
    Click "Proceed to Checkout"
    Fill in the shipping address with test data
    Click "Continue to Payment"
    Enter test credit card details
    Click "Place Order"
    Verify an order confirmation page appears
    Verify an order number is displayed
```

### Navigation & Page Verification

```tww
url https://docs.example.com

describe "Documentation Site"

  test "can navigate between sections"
    Click "Getting Started" in the sidebar
    Verify the page heading says "Getting Started"
    Click "API Reference" in the sidebar
    Verify the page heading changes to "API Reference"
    Click the browser back button
    Verify you're back on "Getting Started"

  test "search works"
    Click the search bar
    Type "authentication"
    Verify search results appear
    Click the first result
    Verify the page content is about authentication
```

### Responsive / Multi-State Testing

```tww
url https://myapp.com

describe "Responsive Menu"

  test "mobile menu toggle works"
    Verify the hamburger menu icon is visible
    Click the hamburger menu
    Verify the navigation drawer opens
    Verify links for Home, About, and Contact are visible
    Click the hamburger menu again
    Verify the navigation drawer closes
```

---

## Complete Realistic Example

Here's a full, realistic test file for a todo app — the kind of thing you'd actually check into your repo:

```tww
# Todo App — Full Test Suite
# Tests the React TodoMVC example app
url https://todomvc.com/examples/react/dist/

describe "Todo MVC"

  before each
    Verify the input field with placeholder "What needs to be done?" is visible

  test "can add a todo"
    Type "Buy groceries" in the input field
    Press Enter
    Verify "Buy groceries" appears in the todo list

  test "can add multiple todos"
    Type "Buy groceries" and press Enter
    Type "Write tests" and press Enter
    Type "Ship feature" and press Enter
    Verify all three items appear in the list
    Verify the footer shows "3 items left"

  test "can complete a todo"
    Type "Write tests" in the input field
    Press Enter
    Click the checkbox next to "Write tests"
    Verify "Write tests" is marked as completed (strikethrough)

  test "can delete a todo"
    Type "Temporary item" in the input field
    Press Enter
    Hover over "Temporary item"
    Click the delete button (X) next to it
    Verify "Temporary item" is no longer in the list

  test "can edit a todo"
    Type "Misspeled item" and press Enter
    Double-click on "Misspeled item" to edit it
    Clear the text and type "Fixed item"
    Press Enter
    Verify "Fixed item" appears in the list
    Verify "Misspeled item" is gone

  describe "Filters"

    before each
      Type "Task 1" and press Enter
      Type "Task 2" and press Enter
      Complete "Task 1" by clicking its checkbox

    test "can filter active todos"
      Click the "Active" filter
      Verify only "Task 2" is visible
      Verify "Task 1" is not visible

    test "can filter completed todos"
      Click the "Completed" filter
      Verify only "Task 1" is visible
      Verify "Task 2" is not visible

    test "can show all todos"
      Click the "Active" filter
      Click the "All" filter
      Verify both "Task 1" and "Task 2" are visible
```

---

## Writing Tips

- **Be specific.** "Click the Submit button" beats "click submit" — the AI finds exact matches more reliably.
- **One action per line** is easiest to debug. Multi-action lines work, but when a test fails, you'll appreciate the granularity.
- **Use quotes** around exact text: `Verify "Order confirmed" appears`. This tells the AI exactly what string to look for.
- **Name your tests well.** Names show up in pass/fail output — make them descriptive so you know what broke at a glance.
- **Keep tests focused.** 3-8 lines per test is the sweet spot. Break long flows into multiple tests with `before each` for shared setup.
- **Think like a user.** Write what a person would do, not what a robot would do. "Search for wireless mouse" not "Input text wireless mouse into element #search-box".

See the [Getting Started Guide](GUIDE.md) for a walkthrough, or the [CLI Reference](CLI.md) for how to run your tests.

Full format reference and examples at [testwithwords.com](https://testwithwords.com).
