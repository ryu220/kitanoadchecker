#!/usr/bin/env tsx
/**
 * 環境チェックスクリプト
 *
 * 他社が環境をセットアップする際に、必要な条件が揃っているかチェック
 *
 * 使用方法:
 *   npx tsx scripts/check-environment.ts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title: string) {
  console.log('\n' + '='.repeat(60));
  log(title, 'cyan');
  console.log('='.repeat(60));
}

async function checkChromaDB(): Promise<boolean> {
  try {
    // Try heartbeat endpoint first (most reliable)
    const heartbeatResponse = await fetch('http://localhost:8000/api/v1/heartbeat');

    if (heartbeatResponse.status === 200) {
      log('✅ ChromaDB is running on http://localhost:8000', 'green');
      return true;
    }

    // If heartbeat fails with 410 (deprecated), ChromaDB is running but using newer API
    if (heartbeatResponse.status === 410) {
      log('✅ ChromaDB is running on http://localhost:8000', 'green');
      log('ℹ️  Note: v1 heartbeat endpoint is deprecated (this is normal)', 'cyan');
      return true;
    }

    log(`❌ ChromaDB returned unexpected status: ${heartbeatResponse.status}`, 'red');
    return false;
  } catch (error) {
    log('❌ ChromaDB is not running', 'red');
    log('   Please start ChromaDB: docker-compose up chroma -d', 'yellow');
    return false;
  }
}

async function checkVectorDBData(): Promise<boolean> {
  try {
    // ChromaDB v2 API to get collection info
    const response = await fetch('http://localhost:8000/api/v1/collections/ad_checker_knowledge');

    if (response.ok) {
      const collection = await response.json();
      const count = collection.count || 0;

      if (count > 0) {
        log(`✅ Vector DB has ${count} documents`, 'green');
        return true;
      } else {
        log('⚠️  Vector DB is empty (0 documents)', 'yellow');
        log('   Please run: npm run setup:vector-db', 'yellow');
        return false;
      }
    } else if (response.status === 404) {
      log('⚠️  Vector DB collection not found (will be created automatically)', 'yellow');
      return false;
    } else {
      log('⚠️  Could not check Vector DB document count', 'yellow');
      return false;
    }
  } catch (error) {
    log('⚠️  Could not check Vector DB data', 'yellow');
    return false;
  }
}

function checkEnvFile(): boolean {
  const envPath = path.join(process.cwd(), '.env');

  if (!fs.existsSync(envPath)) {
    log('❌ .env file not found', 'red');
    log('   Please create .env file with GEMINI_API_KEY', 'yellow');
    return false;
  }

  const envContent = fs.readFileSync(envPath, 'utf-8');

  // Check GEMINI_API_KEY
  const hasGeminiKey = envContent.includes('GEMINI_API_KEY=') && !envContent.includes('GEMINI_API_KEY=YOUR_API_KEY_HERE');

  if (hasGeminiKey) {
    log('✅ .env file exists with GEMINI_API_KEY', 'green');
  } else {
    log('⚠️  GEMINI_API_KEY is not set or is placeholder', 'yellow');
    log('   This is OK if users provide their own API key at runtime', 'yellow');
  }

  // Check CHROMA_URL
  if (envContent.includes('CHROMA_URL=')) {
    log('✅ CHROMA_URL is configured', 'green');
  } else {
    log('⚠️  CHROMA_URL is not set (will use default: http://localhost:8000)', 'yellow');
  }

  return true;
}

function checkKnowledgeFiles(): boolean {
  const knowledgePath = path.join(process.cwd(), 'knowledge');

  if (!fs.existsSync(knowledgePath)) {
    log('❌ knowledge/ directory not found', 'red');
    return false;
  }

  // Check common knowledge files
  const commonPath = path.join(knowledgePath, 'common');
  if (!fs.existsSync(commonPath)) {
    log('❌ knowledge/common/ directory not found', 'red');
    return false;
  }

  const commonFiles = fs.readdirSync(commonPath);
  const txtFiles = commonFiles.filter(f => f.endsWith('.txt'));

  if (txtFiles.length > 0) {
    log(`✅ Found ${txtFiles.length} knowledge files in knowledge/common/`, 'green');
  } else {
    log('⚠️  No .txt files found in knowledge/common/', 'yellow');
  }

  // Check product-specific directories
  const productDirs = ['HA', 'SH'].filter(dir =>
    fs.existsSync(path.join(knowledgePath, dir))
  );

  if (productDirs.length > 0) {
    log(`✅ Found product directories: ${productDirs.join(', ')}`, 'green');
  }

  return true;
}

function checkNodeModules(): boolean {
  const nodeModulesPath = path.join(process.cwd(), 'node_modules');

  if (!fs.existsSync(nodeModulesPath)) {
    log('❌ node_modules/ not found', 'red');
    log('   Please run: npm install', 'yellow');
    return false;
  }

  log('✅ node_modules/ exists', 'green');
  return true;
}

async function checkDockerCompose(): Promise<boolean> {
  try {
    const { execSync } = await import('child_process');
    execSync('docker-compose --version', { stdio: 'ignore' });
    log('✅ docker-compose is installed', 'green');
    return true;
  } catch (error) {
    log('❌ docker-compose is not installed', 'red');
    log('   Please install Docker Desktop', 'yellow');
    return false;
  }
}

async function main() {
  logSection('🔍 Environment Check for Ad Legal Checker');

  log('\nChecking system requirements...', 'blue');

  // 1. Check Node modules
  logSection('1️⃣  Node Modules');
  const hasNodeModules = checkNodeModules();

  // 2. Check .env file
  logSection('2️⃣  Environment Variables');
  const hasEnv = checkEnvFile();

  // 3. Check knowledge files
  logSection('3️⃣  Knowledge Files');
  const hasKnowledge = checkKnowledgeFiles();

  // 4. Check Docker Compose
  logSection('4️⃣  Docker Compose');
  const hasDockerCompose = await checkDockerCompose();

  // 5. Check ChromaDB
  logSection('5️⃣  ChromaDB Server');
  const hasChromaDB = await checkChromaDB();

  // 6. Check Vector DB data
  logSection('6️⃣  Vector DB Data');
  const hasVectorDBData = await checkVectorDBData();

  // Summary
  logSection('📊 Summary');

  const checks = [
    { name: 'Node Modules', passed: hasNodeModules, required: true },
    { name: 'Environment File', passed: hasEnv, required: true },
    { name: 'Knowledge Files', passed: hasKnowledge, required: true },
    { name: 'Docker Compose', passed: hasDockerCompose, required: true },
    { name: 'ChromaDB Server', passed: hasChromaDB, required: true },
    { name: 'Vector DB Data', passed: hasVectorDBData, required: false },
  ];

  const passedRequired = checks.filter(c => c.required && c.passed).length;
  const totalRequired = checks.filter(c => c.required).length;

  console.log('\nCheck Results:');
  checks.forEach(check => {
    const icon = check.passed ? '✅' : (check.required ? '❌' : '⚠️');
    const status = check.passed ? 'PASS' : (check.required ? 'FAIL' : 'WARN');
    log(`  ${icon} ${check.name}: ${status}`, check.passed ? 'green' : (check.required ? 'red' : 'yellow'));
  });

  console.log('\n');

  if (passedRequired === totalRequired) {
    log('🎉 All required checks passed! You can start the application.', 'green');
    log('\nTo start the development server:', 'cyan');
    log('  npm run dev', 'yellow');

    if (!hasVectorDBData) {
      log('\n⚠️  Note: Vector DB is empty. To enable RAG search:', 'yellow');
      log('  1. Set GEMINI_API_KEY in .env', 'yellow');
      log('  2. Run: npm run setup:vector-db', 'yellow');
    }

    process.exit(0);
  } else {
    log(`❌ ${totalRequired - passedRequired} required check(s) failed.`, 'red');
    log('\nPlease fix the issues above before starting the application.', 'yellow');

    log('\n📖 Quick Setup Guide:', 'cyan');

    if (!hasNodeModules) {
      log('  1. Install dependencies: npm install', 'yellow');
    }

    if (!hasEnv) {
      log('  2. Create .env file: cp .env.example .env', 'yellow');
    }

    if (!hasDockerCompose) {
      log('  3. Install Docker Desktop: https://www.docker.com/products/docker-desktop', 'yellow');
    }

    if (!hasChromaDB) {
      log('  4. Start ChromaDB: docker-compose up chroma -d', 'yellow');
    }

    if (!hasVectorDBData) {
      log('  5. (Optional) Load Vector DB: npm run setup:vector-db', 'yellow');
    }

    process.exit(1);
  }
}

main().catch(error => {
  log('\n❌ Environment check failed with error:', 'red');
  console.error(error);
  process.exit(1);
});
