# add node bin script path for recipes
export PATH := "./node_modules/.bin:" + env_var('PATH')

# Default: display available recipes
_help:
    @just --list

# –––––––––––––----------------------------------------------------------------
# Setup
# –––––––––––––----------------------------------------------------------------

# Set up the dev environment
setup-dev-env:
    scripts/setup-dev-env

# Install node modules afresh
install *params: clean
    npm install {{params}}

# Clean up node modules
clean:
    rm -rf node_modules

# Install node modules strictly as specified (typically for CI)
install-stable:
    npm ci

# –––––––––––––----------------------------------------------------------------
# Run
# –––––––––––––----------------------------------------------------------------

# Run the renewal process
run:
    NODE_ENV=development bin/renew

# –––––––––––––----------------------------------------------------------------
# Test & related
# –––––––––––––----------------------------------------------------------------

# Run code linting
lint *params:
    semistandard {{params}}

# Run tests with optional extra parameters
test *params:
    NODE_ENV=test mocha {{params}}

# Run tests with detailed output
test-detailed *params:
    NODE_ENV=test mocha --reporter=spec {{params}}

# Run tests with detailed output for debugging
test-debug *params:
    NODE_ENV=test mocha --timeout 3600000 --reporter=spec --inspect-brk=40000 {{params}}

# Run tests and generate HTML coverage report
test-cover *params:
    NODE_ENV=test nyc --reporter=html --report-dir=./coverage mocha {{params}}

# –––––––––––––----------------------------------------------------------------
# Misc. utils
# –––––––––––––----------------------------------------------------------------

# Run source licensing tool (see 'licensing' folder for details)
license:
    source-licenser --config-file .licenser.yml ./
