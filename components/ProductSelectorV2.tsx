'use client';

import { useState } from 'react';

interface ProductInfo {
  id: string;
  name: string;
  category: string;
  approvedEffects: string;
  activeIngredient?: string;
  specialNotes?: string;
  knowledgeFiles: {
    common: string[];
    specific: {
      yakujihou: string[];
      keihyouhou: string[];
      other: string[];
    };
  };
}

interface Props {
  selectedProductId: string;
  onSelect: (productId: string) => void;
  disabled?: boolean;
}

// Phase 2: 現在設定ファイルが存在する商品リスト（HA, SH）
const AVAILABLE_PRODUCTS: ProductInfo[] = [
  {
    id: 'HA',
    name: 'ヒアロディープパッチ',
    category: '化粧品',
    approvedEffects: '56項目（化粧品効能効果）',
    knowledgeFiles: {
      common: ['common/特商法.txt'],
      specific: {
        yakujihou: ['HA/01_薬機法ルール.txt'],
        keihyouhou: ['HA/02_景表法ルール.txt'],
        other: ['HA/03_商品固有ルール.txt']
      }
    }
  },
  {
    id: 'SH',
    name: 'クリアストロングショット アルファ',
    category: '新指定医薬部外品',
    approvedEffects: '手指・皮膚の洗浄・消毒',
    activeIngredient: 'ベンザルコニウム塩化物',
    knowledgeFiles: {
      common: ['common/特商法.txt'],
      specific: {
        yakujihou: ['SH/01_薬機法ルール.txt'],
        keihyouhou: ['SH/02_景表法ルール.txt'],
        other: ['SH/03_商品固有ルール.txt']
      }
    }
  }
];

export function ProductSelectorV2({ selectedProductId, onSelect, disabled = false }: Props) {
  const [showDetails, setShowDetails] = useState(true);

  const products = AVAILABLE_PRODUCTS;
  const selectedProduct = products.find(p => p.id === selectedProductId) || products[0];

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="product" className="block text-sm font-medium text-gray-700 mb-2">
          商品選択 <span className="text-red-500">*</span>
        </label>
        <select
          id="product"
          value={selectedProductId}
          onChange={(e) => onSelect(e.target.value)}
          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
          disabled={disabled}
          aria-label="商品選択"
          aria-required="true"
        >
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.id} - {product.name}
            </option>
          ))}
        </select>
      </div>

      {selectedProduct && (
        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center justify-between w-full text-left font-medium text-gray-900 mb-2"
            aria-expanded={showDetails}
            aria-controls="product-details"
          >
            <span>商品詳細</span>
            <svg
              className={`w-5 h-5 transition-transform ${showDetails ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showDetails && (
            <div id="product-details" className="space-y-2 text-sm">
              <div className="grid grid-cols-[120px,1fr] gap-2">
                <dt className="font-medium text-gray-600">商品名:</dt>
                <dd className="text-gray-900">{selectedProduct.name}</dd>

                <dt className="font-medium text-gray-600">カテゴリ:</dt>
                <dd className="text-gray-900">{selectedProduct.category}</dd>

                <dt className="font-medium text-gray-600">承認効果:</dt>
                <dd className="text-gray-900">{selectedProduct.approvedEffects}</dd>

                {selectedProduct.activeIngredient && (
                  <>
                    <dt className="font-medium text-gray-600">有効成分:</dt>
                    <dd className="text-gray-900">{selectedProduct.activeIngredient}</dd>
                  </>
                )}

                {selectedProduct.specialNotes && (
                  <>
                    <dt className="font-medium text-gray-600">特記事項:</dt>
                    <dd className="text-gray-900">{selectedProduct.specialNotes}</dd>
                  </>
                )}
              </div>

              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs text-gray-500">
                  関連ナレッジファイル: {
                    selectedProduct.knowledgeFiles.common.length +
                    selectedProduct.knowledgeFiles.specific.yakujihou.length +
                    selectedProduct.knowledgeFiles.specific.keihyouhou.length +
                    selectedProduct.knowledgeFiles.specific.other.length
                  } 件
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
