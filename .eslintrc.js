module.exports = {
  extends: [
    '@antfu',
  ],
  rules: {
    'vue/no-deprecated-slot-attribute': 'off',
    'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
  },
}
