const fs = require('fs');
const path = require('path');

const source = path.join(__dirname, '../public');
const destination = path.join(__dirname, '../dist');

fs.cpSync(source, destination, {
  recursive: true
});

console.log('Build concluído com sucesso!');
console.log('Arquivos de produção disponíveis em /dist');
