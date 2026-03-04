// Parser unit tests — uses Node's built-in test runner (node:test)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseTWWString, ParseError } from '../parser.js';

describe('parseTWWString', () => {
  // ─── Basic parsing ───

  it('parses a minimal test file', async () => {
    const input = `
describe "Login"
  test "shows form"
    Verify the login form is visible
`;
    const suite = await parseTWWString(input);
    assert.equal(suite.groups.length, 1);
    assert.equal(suite.groups[0].name, 'Login');
    assert.equal(suite.groups[0].tests.length, 1);
    assert.equal(suite.groups[0].tests[0].name, 'shows form');
    assert.equal(suite.groups[0].tests[0].scenario, 'Verify the login form is visible');
  });

  it('parses url directive', async () => {
    const input = `
url https://example.com

describe "Home"
  test "loads"
    Check the page loads
`;
    const suite = await parseTWWString(input);
    assert.equal(suite.defaultUrl, 'https://example.com');
  });

  it('preserves line numbers', async () => {
    const input = `url https://example.com

describe "Tests"
  test "first"
    Step one
`;
    const suite = await parseTWWString(input);
    assert.equal(suite.groups[0].line, 3);
    assert.equal(suite.groups[0].tests[0].line, 4);
  });

  // ─── Multiple tests ───

  it('parses multiple tests in one describe', async () => {
    const input = `
describe "Navigation"
  test "home link"
    Click the Home link
    Verify the homepage loads

  test "about link"
    Click the About link
    Verify the about page loads
`;
    const suite = await parseTWWString(input);
    assert.equal(suite.groups[0].tests.length, 2);
    assert.equal(suite.groups[0].tests[0].name, 'home link');
    assert.equal(suite.groups[0].tests[1].name, 'about link');
  });

  it('concatenates multi-line scenarios with newlines', async () => {
    const input = `
describe "Form"
  test "fill and submit"
    Fill the name field with "John"
    Fill the email field with "john@test.com"
    Click Submit
    Verify the success message appears
`;
    const suite = await parseTWWString(input);
    const scenario = suite.groups[0].tests[0].scenario;
    assert.ok(scenario.includes('Fill the name field'));
    assert.ok(scenario.includes('Click Submit'));
    assert.ok(scenario.includes('\n'));
    assert.equal(scenario.split('\n').length, 4);
  });

  // ─── Comments and blanks ───

  it('ignores comments and blank lines', async () => {
    const input = `
# This is a comment
url https://example.com

# Another comment
describe "Test"
  # Comment inside describe
  test "works"
    # Comment inside test
    Do something
`;
    const suite = await parseTWWString(input);
    assert.equal(suite.defaultUrl, 'https://example.com');
    assert.equal(suite.groups[0].tests[0].scenario, 'Do something');
  });

  // ─── Hooks ───

  it('parses before each', async () => {
    const input = `
describe "Dashboard"
  before each
    Navigate to the homepage
    Click the login button
    Enter credentials

  test "shows widgets"
    Verify the dashboard widgets are visible
`;
    const suite = await parseTWWString(input);
    assert.ok(suite.groups[0].beforeEach);
    assert.ok(suite.groups[0].beforeEach!.includes('Navigate to the homepage'));
    assert.ok(suite.groups[0].beforeEach!.includes('Enter credentials'));
  });

  it('parses after each', async () => {
    const input = `
describe "Tests"
  after each
    Click the logout button

  test "thing"
    Do something
`;
    const suite = await parseTWWString(input);
    assert.ok(suite.groups[0].afterEach);
    assert.ok(suite.groups[0].afterEach!.includes('Click the logout button'));
  });

  it('parses before all and after all', async () => {
    const input = `
describe "Suite"
  before all
    Set up the database

  after all
    Clean up the database

  test "query"
    Run a database query
`;
    const suite = await parseTWWString(input);
    assert.ok(suite.groups[0].beforeAll);
    assert.ok(suite.groups[0].afterAll);
  });

  // ─── Nesting ───

  it('parses nested describe blocks', async () => {
    const input = `
describe "App"
  describe "Header"
    test "shows logo"
      Verify the logo is visible

  describe "Footer"
    test "shows copyright"
      Verify the copyright notice
`;
    const suite = await parseTWWString(input);
    assert.equal(suite.groups[0].name, 'App');
    assert.equal(suite.groups[0].children.length, 2);
    assert.equal(suite.groups[0].children[0].name, 'Header');
    assert.equal(suite.groups[0].children[1].name, 'Footer');
    assert.equal(suite.groups[0].children[0].tests[0].name, 'shows logo');
  });

  it('parses deeply nested describe blocks', async () => {
    const input = `
describe "Level 1"
  describe "Level 2"
    describe "Level 3"
      test "deep test"
        Verify the deep thing
`;
    const suite = await parseTWWString(input);
    assert.equal(suite.groups[0].children[0].children[0].tests[0].name, 'deep test');
  });

  it('hooks apply to their describe level', async () => {
    const input = `
describe "Outer"
  before each
    Log in

  describe "Inner"
    before each
      Open settings

    test "works"
      Check the setting
`;
    const suite = await parseTWWString(input);
    assert.ok(suite.groups[0].beforeEach!.includes('Log in'));
    assert.ok(suite.groups[0].children[0].beforeEach!.includes('Open settings'));
  });

  // ─── Top-level test (implicit group) ───

  it('wraps top-level tests in an implicit (root) group', async () => {
    const input = `
test "standalone"
  Verify something works
`;
    const suite = await parseTWWString(input);
    assert.equal(suite.groups.length, 1);
    assert.equal(suite.groups[0].name, '(root)');
    assert.equal(suite.groups[0].tests[0].name, 'standalone');
  });

  // ─── Single quotes ───

  it('supports single-quoted names', async () => {
    const input = `
describe 'Login Page'
  test 'shows form'
    Verify the form
`;
    const suite = await parseTWWString(input);
    assert.equal(suite.groups[0].name, 'Login Page');
    assert.equal(suite.groups[0].tests[0].name, 'shows form');
  });

  // ─── Multiple describe blocks ───

  it('parses multiple top-level describe blocks', async () => {
    const input = `
describe "Auth"
  test "login"
    Test login

describe "Dashboard"
  test "widgets"
    Test widgets
`;
    const suite = await parseTWWString(input);
    assert.equal(suite.groups.length, 2);
    assert.equal(suite.groups[0].name, 'Auth');
    assert.equal(suite.groups[1].name, 'Dashboard');
  });

  // ─── Error cases ───

  it('errors on empty test body', async () => {
    const input = `
describe "Test"
  test "empty"
`;
    await assert.rejects(
      () => parseTWWString(input),
      (err: Error) => {
        assert.ok(err instanceof ParseError);
        assert.ok(err.message.includes('has no body'));
        return true;
      },
    );
  });

  it('errors on empty hook body', async () => {
    const input = `
describe "Test"
  before each

  test "thing"
    Do something
`;
    await assert.rejects(
      () => parseTWWString(input),
      (err: Error) => {
        assert.ok(err instanceof ParseError);
        assert.ok(err.message.includes('has no body'));
        return true;
      },
    );
  });

  it('errors on duplicate hooks', async () => {
    const input = `
describe "Test"
  before each
    Step one

  before each
    Step two

  test "thing"
    Do something
`;
    await assert.rejects(
      () => parseTWWString(input),
      (err: Error) => {
        assert.ok(err instanceof ParseError);
        assert.ok(err.message.includes('Duplicate'));
        return true;
      },
    );
  });

  it('errors on top-level before each', async () => {
    const input = `
before each
  Do something
`;
    await assert.rejects(
      () => parseTWWString(input),
      (err: Error) => {
        assert.ok(err instanceof ParseError);
        assert.ok(err.message.includes('must be inside a describe'));
        return true;
      },
    );
  });

  it('errors on unexpected top-level content', async () => {
    const input = `
Just some random text at top level
`;
    await assert.rejects(
      () => parseTWWString(input),
      (err: Error) => {
        assert.ok(err instanceof ParseError);
        assert.ok(err.message.includes('Unexpected content'));
        return true;
      },
    );
  });

  it('errors on unexpected content inside describe', async () => {
    const input = `
describe "Test"
  random stuff here
`;
    await assert.rejects(
      () => parseTWWString(input),
      (err: Error) => {
        assert.ok(err instanceof ParseError);
        assert.ok(err.message.includes('Unexpected inside describe'));
        return true;
      },
    );
  });

  it('errors on malformed describe (no quoted name)', async () => {
    const input = `
describe Login
  test "thing"
    Do something
`;
    await assert.rejects(
      () => parseTWWString(input),
      (err: Error) => {
        assert.ok(err instanceof ParseError);
        assert.ok(err.message.includes('quoted name'));
        return true;
      },
    );
  });

  it('errors on top-level use', async () => {
    const input = `
use "some/file.tww"
`;
    await assert.rejects(
      () => parseTWWString(input),
      (err: Error) => {
        assert.ok(err instanceof ParseError);
        assert.ok(err.message.includes('top level'));
        return true;
      },
    );
  });

  // ─── Comprehensive example ───

  it('parses a full realistic .tww file', async () => {
    const input = `
# E-commerce checkout tests
url https://shop.example.com

describe "Shopping Cart"
  before each
    Navigate to the homepage
    Add an item to the cart
    Go to the cart page

  test "shows cart items"
    Verify at least one item is in the cart
    Verify the total price is visible

  test "can update quantity"
    Change the quantity of the first item to 3
    Verify the total price updates

  describe "Checkout"
    before each
      Click the Checkout button

    test "shows address form"
      Verify the shipping address form is visible
      Verify there are fields for name, address, city, zip

    test "validates required fields"
      Click Submit without filling in fields
      Verify error messages appear for required fields
`;
    const suite = await parseTWWString(input);
    assert.equal(suite.defaultUrl, 'https://shop.example.com');
    assert.equal(suite.groups.length, 1);

    const cart = suite.groups[0];
    assert.equal(cart.name, 'Shopping Cart');
    assert.ok(cart.beforeEach);
    assert.equal(cart.tests.length, 2);
    assert.equal(cart.children.length, 1);

    const checkout = cart.children[0];
    assert.equal(checkout.name, 'Checkout');
    assert.ok(checkout.beforeEach);
    assert.equal(checkout.tests.length, 2);
    assert.equal(checkout.tests[0].name, 'shows address form');
  });
});
