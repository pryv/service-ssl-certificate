module.exports = {
  parser: "babel-eslint",
  plugins: ["flowtype"],
  env: {
    es6: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:flowtype/recommended",
    "prettier",
    "airbnb"
  ],
  parserOptions: {
    sourceType: "module",
  },
  rules: {
    indent: [
      "warn",
      2,
      {
        VariableDeclarator: { var: 2, let: 2, const: 3 },
        SwitchCase: 1,
      },
    ],
    "linebreak-style": ["error", "unix"],
    quotes: ["error", "single"],
  },
  "overrides": [
    {
      "files": ["*.js"],
      "rules": {
        "no-use-before-define": "off",
        "global-require": "off",
        "import/no-unresolved": "off",
        "max-len": "off",
        "no-shadow": "off",
        "func-names": "off",
        "no-restricted-syntax": "off",
        "import/no-dynamic-require": "off",
        "no-param-reassign": "off",
        "max-classes-per-file": "off",
        "no-plusplus": "off",
        "space-unary-ops": "off",
      }
    }
  ]
};
