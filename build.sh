#!/bin/sh
set -e
set -x

rm -rf .build dist
mkdir .build
cp -r ./app ./.build/app
cp -r ./lib ./.build/lib
cp ./index.js ./index.ls ./package.json ./.build
cp -r ./node_modules ./.build/node_modules
rm -rf ./.build/node_modules/electron-packager

./node_modules/.bin/electron-packager ./.build 'Oulipo' --platform=darwin --arch=x64 --version=0.28.1 --out=dist
cp ./Info.plist ./dist/Oulipo.app/Info.plist

rm -rf .build
