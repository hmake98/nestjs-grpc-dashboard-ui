import eslintConfigPrettier from 'eslint-config-prettier';
import tsEsLintPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import tsEslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import vitestPlugin from 'eslint-plugin-vitest';

const rules = tsEslint.configs.recommended
    .map(config => config.rules)
    .filter(rules => rules !== undefined)
    .reduce((a, b) => ({ ...b, ...a }), {});

export default [
    eslintConfigPrettier,
    {
        ignores: [
            '.github/*',
            '.husky/*',
            'coverage/*',
            'dist/*',
            'docs/*',
            'node_modules/*',
        ],
    },
    {
        name: 'ts/default',
        files: ['src/**/*.{ts,tsx}'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            parser: tsParser,
            parserOptions: {
                project: 'tsconfig.json',
                tsconfigRootDir: '.',
                ecmaFeatures: {
                    jsx: true
                }
            },
        },
        linterOptions: {
            noInlineConfig: true,
            reportUnusedDisableDirectives: true,
        },
        plugins: {
            '@typescript-eslint': tsEsLintPlugin,
            'react': reactPlugin,
            'react-hooks': reactHooksPlugin,
            'jsx-a11y': jsxA11yPlugin,
        },
        settings: {
            react: {
                version: 'detect'
            }
        },
        rules: {
            ...rules,
            '@typescript-eslint/no-explicit-any': 'off',
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': [
                'warn',
                {
                    args: 'all',
                    argsIgnorePattern: '^_',
                    caughtErrors: 'all',
                    caughtErrorsIgnorePattern: '^_',
                    destructuredArrayIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    ignoreRestSiblings: true,
                },
            ],
            // React specific rules
            'react/prop-types': 'off',
            'react/react-in-jsx-scope': 'off',
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',
            'jsx-a11y/alt-text': 'warn',
            'jsx-a11y/anchor-has-content': 'warn',
        },
    },
    {
        name: 'ts/test',
        files: ['**/*.{test,spec}.{ts,tsx}'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            parser: tsParser,
            parserOptions: {
                project: 'tsconfig.json',
                tsconfigRootDir: '.',
                ecmaFeatures: {
                    jsx: true
                }
            },
        },
        linterOptions: {
            noInlineConfig: false,
            reportUnusedDisableDirectives: true,
        },
        plugins: {
            '@typescript-eslint': tsEsLintPlugin,
            'react': reactPlugin,
            'react-hooks': reactHooksPlugin,
            'vitest': vitestPlugin,
        },
        settings: {
            react: {
                version: 'detect'
            }
        },
        rules: {
            ...rules,
            '@typescript-eslint/no-explicit-any': 'off',
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': [
                'warn',
                {
                    args: 'all',
                    argsIgnorePattern: '^_',
                    caughtErrors: 'all',
                    caughtErrorsIgnorePattern: '^_',
                    destructuredArrayIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    ignoreRestSiblings: true,
                },
            ],
            // Test specific rules
            'vitest/expect-expect': 'warn',
            'vitest/no-disabled-tests': 'warn',
        },
    },
];