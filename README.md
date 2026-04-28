docker run --name sinhala-mysql -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=sinhala_voice -p 3306:3306 -d mysql:8.0

docker start sinhala-mysql

pnpm db:push
node scripts/seed-phonemes.mjs

$env:NODE_ENV="development"            
pnpm exec tsx watch server/_core/index.ts