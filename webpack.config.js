const path = require('path');

module.exports = {
  entry: './src/index.ts',
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              configFile: "tsconfig.es5.json"
            }
          }
        ],
      },
      {
        test: /(\.js)$/,
        exclude: /(node_modules|bower_components)/,
        use: {
          // babel-loader to convert ES6 code to ES5 + amdCleaning requirejs code into simple JS code, taking care of modules to load as desired
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-es2015'],
          }
        }
      }
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    filename: 'bundle.umd.js',
    path: path.resolve(__dirname, 'dist'),
    library: {
      name: 'Pikoman',
      type: 'umd',
    },
  },
};