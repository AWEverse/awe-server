module.exports = {
 parser: '@typescript-eslint/parser',
 plugins: ['@typescript-eslint', 'prettier'],
 extends: [
   'eslint:recommended',
   'plugin:@typescript-eslint/recommended',
   'plugin:prettier/recommended',
 ],
 rules: {
   'prettier/prettier': ['error', { endOfLine: 'lf' }],
   '@typescript-eslint/no-unused-vars': ['error'],
   'no-console': 'warn',
 },
 env: {
   node: true,
   es2021: true,
 },
};