module.exports = ({ env }) => ({
  plugins: [env('test') ? 'istanbul' : 'static-fs'],
});
