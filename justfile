# add node bin script path for recipes
export PATH := "./node_modules/.bin:" + env_var('PATH')

# Default: display available recipes
_help:
    @just --list

# –––––––––––––----------------------------------------------------------------
# Setup
# –––––––––––––----------------------------------------------------------------

# Set up the dev environment on a MacOS or GNU/Linux system
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

# Start the given server component for dev (expects 'dist/{component}/bin/server')
run:
    NODE_ENV=development bin/renew

# –––––––––––––----------------------------------------------------------------
# Test & related
# –––––––––––––----------------------------------------------------------------

# Run code linting
lint *params:
    npx semistandard {{params}}

# Run tests on the given component ('all' for all components) with optional extra parameters
test *params:
    NODE_ENV=test npx mocha {{params}}

# Run tests with detailed output
test-detailed *params:
    NODE_ENV=test npx mocha --reporter=spec {{params}}

# Run tests with detailed output for debugging
test-debug *params:
    NODE_ENV=test npx mocha --timeout 3600000 --reporter=spec --inspect-brk=40000 {{params}}

# Run tests and generate HTML coverage report
test-cover *params:
    NODE_ENV=test nyc --reporter=html --report-dir=./coverage npx mocha {{params}}

# –––––––––––––----------------------------------------------------------------
# Misc. utils
# –––––––––––––----------------------------------------------------------------

# Run source licensing tool (see 'licensing' folder for details)
license:
    # source-licenser --config-file licensing/config.yml ./
