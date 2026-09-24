/**
 * lib/certificates/qr-svg.ts — Phase 9D
 * Pure, self-contained ISO/IEC QR Code SVG generator with zero external runtime dependencies.
 * Matches clasptek_invoice_system.html 100% for high-resolution vector certificate verification.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface QrSvgOptions {
  cellSize?: number;
  margin?: number;
  typeNumber?: number;
  errorCorrectionLevel?: number;
}

export function generateCertificateQrSvg(text: string, options?: QrSvgOptions): string {
  try {
    const opts = options || {};
    const cellSize = opts.cellSize || 1.1;
    const margin = opts.margin !== undefined ? opts.margin : 0;

    function QR8bitByte(this: any, data: string) {
      this.mode = 4;
      this.data = data;
    }
    QR8bitByte.prototype = {
      getLength: function (this: any) {
        return this.data.length;
      },
      write: function (this: any, buffer: any) {
        for (let i = 0; i < this.data.length; i++) buffer.put(this.data.charCodeAt(i), 8);
      },
    };

    function QRCode(this: any, typeNumber: number, errorCorrectionLevel: number) {
      this.typeNumber = typeNumber;
      this.errorCorrectionLevel = errorCorrectionLevel;
      this.modules = null;
      this.moduleCount = 0;
      this.dataCache = null;
      this.dataList = [];
    }

    QRCode.prototype = {
      addData: function (this: any, data: string) {
        this.dataList.push(new (QR8bitByte as any)(data));
        this.dataCache = null;
      },
      isDark: function (this: any, row: number, col: number) {
        return this.modules[row][col];
      },
      getModuleCount: function (this: any) {
        return this.moduleCount;
      },
      make: function (this: any) {
        if (this.typeNumber < 1) {
          for (let testType = 1; testType < 40; testType++) {
            const rsBlocks = (QRRSBlock as any).getRSBlocks(testType, this.errorCorrectionLevel);
            const buffer = new (QRBitBuffer as any)();
            let totalDataCount = 0;
            for (let i = 0; i < rsBlocks.length; i++) totalDataCount += rsBlocks[i].dataCount;
            for (let j = 0; j < this.dataList.length; j++) {
              const d = this.dataList[j];
              buffer.put(d.mode, 4);
              buffer.put(d.getLength(), (QRUtil as any).getLengthInBits(d.mode, testType));
              d.write(buffer);
            }
            if (buffer.getLengthInBits() <= totalDataCount * 8) {
              this.typeNumber = testType;
              break;
            }
          }
        }
        this.makeImpl(false, this.getBestMaskPattern());
      },
      makeImpl: function (this: any, test: boolean, maskPattern: number) {
        this.moduleCount = this.typeNumber * 4 + 17;
        this.modules = new Array(this.moduleCount);
        for (let row = 0; row < this.moduleCount; row++) {
          this.modules[row] = new Array(this.moduleCount);
          for (let col = 0; col < this.moduleCount; col++) this.modules[row][col] = null;
        }
        this.setupPositionProbePattern(0, 0);
        this.setupPositionProbePattern(this.moduleCount - 7, 0);
        this.setupPositionProbePattern(0, this.moduleCount - 7);
        this.setupPositionAdjustPattern();
        this.setupTimingPattern();
        this.setupTypeInfo(test, maskPattern);
        if (this.typeNumber >= 7) this.setupTypeNumber(test);
        if (this.dataCache == null)
          this.dataCache = (QRCode as any).createData(this.typeNumber, this.errorCorrectionLevel, this.dataList);
        this.mapData(this.dataCache, maskPattern);
      },
      setupPositionProbePattern: function (this: any, row: number, col: number) {
        for (let r = -1; r <= 7; r++) {
          if (row + r <= -1 || this.moduleCount <= row + r) continue;
          for (let c = -1; c <= 7; c++) {
            if (col + c <= -1 || this.moduleCount <= col + c) continue;
            if (
              (0 <= r && r <= 6 && (c == 0 || c == 6)) ||
              (0 <= c && c <= 6 && (r == 0 || r == 6)) ||
              (2 <= r && r <= 4 && 2 <= c && c <= 4)
            ) {
              this.modules[row + r][col + c] = true;
            } else {
              this.modules[row + r][col + c] = false;
            }
          }
        }
      },
      getBestMaskPattern: function (this: any) {
        let minLostPoint = 0,
          pattern = 0;
        for (let i = 0; i < 8; i++) {
          this.makeImpl(true, i);
          const lostPoint = (QRUtil as any).getLostPoint(this);
          if (i == 0 || minLostPoint > lostPoint) {
            minLostPoint = lostPoint;
            pattern = i;
          }
        }
        return pattern;
      },
      setupTimingPattern: function (this: any) {
        for (let r = 8; r < this.moduleCount - 8; r++) {
          if (this.modules[r][6] == null) this.modules[r][6] = r % 2 == 0;
        }
        for (let c = 8; c < this.moduleCount - 8; c++) {
          if (this.modules[6][c] == null) this.modules[6][c] = c % 2 == 0;
        }
      },
      setupPositionAdjustPattern: function (this: any) {
        const pos = (QRUtil as any).getPatternPosition(this.typeNumber);
        for (let i = 0; i < pos.length; i++) {
          for (let j = 0; j < pos.length; j++) {
            const row = pos[i],
              col = pos[j];
            if (this.modules[row][col] != null) continue;
            for (let r = -2; r <= 2; r++) {
              for (let c = -2; c <= 2; c++) {
                if (r == -2 || r == 2 || c == -2 || c == 2 || (r == 0 && c == 0)) {
                  this.modules[row + r][col + c] = true;
                } else {
                  this.modules[row + r][col + c] = false;
                }
              }
            }
          }
        }
      },
      setupTypeInfo: function (this: any, test: boolean, maskPattern: number) {
        const data = (this.errorCorrectionLevel << 3) | maskPattern;
        const bits = (QRUtil as any).getBCHTypeInfo(data);
        for (let i = 0; i < 15; i++) {
          const mod = !test && ((bits >> i) & 1) == 1;
          if (i < 6) this.modules[i][8] = mod;
          else if (i < 8) this.modules[i + 1][8] = mod;
          else this.modules[this.moduleCount - 15 + i][8] = mod;
        }
        for (let i = 0; i < 15; i++) {
          const mod = !test && ((bits >> i) & 1) == 1;
          if (i < 8) this.modules[8][this.moduleCount - i - 1] = mod;
          else if (i < 9) this.modules[8][15 - i - 1 + 1] = mod;
          else this.modules[8][15 - i - 1] = mod;
        }
        this.modules[this.moduleCount - 8][8] = !test;
      },
      setupTypeNumber: function (this: any, test: boolean) {
        const bits = (QRUtil as any).getBCHTypeNumber(this.typeNumber);
        for (let i = 0; i < 18; i++) {
          const mod = !test && ((bits >> i) & 1) == 1;
          this.modules[Math.floor(i / 3)][(i % 3) + this.moduleCount - 8 - 3] = mod;
        }
        for (let i = 0; i < 18; i++) {
          const mod = !test && ((bits >> i) & 1) == 1;
          this.modules[(i % 3) + this.moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
        }
      },
      mapData: function (this: any, data: any[], maskPattern: number) {
        let inc = -1,
          row = this.moduleCount - 1,
          bitIndex = 7,
          byteIndex = 0;
        const maskFunc = (QRUtil as any).getMaskFunction(maskPattern);
        for (let col = this.moduleCount - 1; col > 0; col -= 2) {
          if (col == 6) col -= 1;
          while (true) {
            for (let c = 0; c < 2; c++) {
              if (this.modules[row][col - c] == null) {
                let dark = false;
                if (byteIndex < data.length) dark = ((data[byteIndex] >>> bitIndex) & 1) == 1;
                if (maskFunc(row, col - c)) dark = !dark;
                this.modules[row][col - c] = dark;
                bitIndex--;
                if (bitIndex == -1) {
                  byteIndex++;
                  bitIndex = 7;
                }
              }
            }
            row += inc;
            if (row < 0 || this.moduleCount <= row) {
              row -= inc;
              inc = -inc;
              break;
            }
          }
        }
      },
      createSvgTag: function (this: any, cSize: number, mgn: number) {
        cSize = cSize || 1.1;
        mgn = mgn !== undefined ? mgn : 0;
        const size = this.getModuleCount() * cSize + mgn * 2 * cSize;
        let svg = `<svg class="cert-qr-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" shape-rendering="crispEdges">`;
        svg += `<rect width="${size}" height="${size}" fill="#FFFFFF"/>`;
        for (let r = 0; r < this.getModuleCount(); r++) {
          for (let c = 0; c < this.getModuleCount(); c++) {
            if (this.isDark(r, c)) {
              const x = (c + mgn) * cSize;
              const y = (r + mgn) * cSize;
              svg += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${(cSize + 0.05).toFixed(2)}" height="${(cSize + 0.05).toFixed(2)}" fill="#080B78"/>`;
            }
          }
        }
        svg += '</svg>';
        return svg;
      },
    };

    (QRCode as any).createData = function (typeNumber: number, errorCorrectionLevel: number, dataList: any[]) {
      const rsBlocks = (QRRSBlock as any).getRSBlocks(typeNumber, errorCorrectionLevel);
      const buffer = new (QRBitBuffer as any)();
      for (let i = 0; i < dataList.length; i++) {
        const d = dataList[i];
        buffer.put(d.mode, 4);
        buffer.put(d.getLength(), (QRUtil as any).getLengthInBits(d.mode, typeNumber));
        d.write(buffer);
      }
      let totalDataCount = 0;
      for (let i = 0; i < rsBlocks.length; i++) totalDataCount += rsBlocks[i].dataCount;
      if (buffer.getLengthInBits() > totalDataCount * 8) throw new Error('QR length overflow');
      if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) buffer.put(0, 4);
      while (buffer.getLengthInBits() % 8 != 0) buffer.putBit(false);
      while (true) {
        if (buffer.getLengthInBits() >= totalDataCount * 8) break;
        buffer.put(0xec, 8);
        if (buffer.getLengthInBits() >= totalDataCount * 8) break;
        buffer.put(0x11, 8);
      }
      return (QRCode as any).createBytes(buffer, rsBlocks);
    };

    (QRCode as any).createBytes = function (buffer: any, rsBlocks: any[]) {
      let offset = 0,
        maxDcCount = 0,
        maxEcCount = 0;
      const dcdata = new Array(rsBlocks.length),
        ecdata = new Array(rsBlocks.length);
      for (let r = 0; r < rsBlocks.length; r++) {
        const dcCount = rsBlocks[r].dataCount,
          ecCount = rsBlocks[r].totalCount - dcCount;
        maxDcCount = Math.max(maxDcCount, dcCount);
        maxEcCount = Math.max(maxEcCount, ecCount);
        dcdata[r] = new Array(dcCount);
        for (let i = 0; i < dcdata[r].length; i++) dcdata[r][i] = 0xff & buffer.buffer[i + offset];
        offset += dcCount;
        const rsPoly = (QRUtil as any).getErrorCorrectPolynomial(ecCount);
        const rawPoly = new (QRPolynomial as any)(dcdata[r], rsPoly.getLength() - 1);
        const modPoly = rawPoly.mod(rsPoly);
        ecdata[r] = new Array(rsPoly.getLength() - 1);
        for (let i = 0; i < ecdata[r].length; i++) {
          const modIndex = i + modPoly.getLength() - ecdata[r].length;
          ecdata[r][i] = modIndex >= 0 ? modPoly.get(modIndex) : 0;
        }
      }
      let totalCodeCount = 0;
      for (let i = 0; i < rsBlocks.length; i++) totalCodeCount += rsBlocks[i].totalCount;
      const data = new Array(totalCodeCount);
      let index = 0;
      for (let i = 0; i < maxDcCount; i++) {
        for (let r = 0; r < rsBlocks.length; r++) {
          if (i < dcdata[r].length) data[index++] = dcdata[r][i];
        }
      }
      for (let i = 0; i < maxEcCount; i++) {
        for (let r = 0; r < rsBlocks.length; r++) {
          if (i < ecdata[r].length) data[index++] = ecdata[r][i];
        }
      }
      return data;
    };

    const QRUtil: any = {
      PATTERN_POSITION_TABLE: [
        [],
        [6, 18],
        [6, 22],
        [6, 26],
        [6, 30],
        [6, 34],
        [6, 22, 38],
        [6, 24, 42],
        [6, 26, 46],
        [6, 28, 50],
        [6, 30, 54],
        [6, 32, 58],
        [6, 34, 62],
        [6, 26, 46, 66],
        [6, 26, 48, 70],
      ],
      G15: (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0),
      G18: (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0),
      G15_MASK: (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1),
      getBCHTypeInfo: function (data: number) {
        let d = data << 10;
        while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15) >= 0) {
          d ^= QRUtil.G15 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15));
        }
        return ((data << 10) | d) ^ QRUtil.G15_MASK;
      },
      getBCHTypeNumber: function (data: number) {
        let d = data << 12;
        while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18) >= 0) {
          d ^= QRUtil.G18 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18));
        }
        return (data << 12) | d;
      },
      getBCHDigit: function (data: number) {
        let digit = 0;
        while (data != 0) {
          digit++;
          data >>>= 1;
        }
        return digit;
      },
      getPatternPosition: function (typeNumber: number) {
        return QRUtil.PATTERN_POSITION_TABLE[typeNumber - 1] || [];
      },
      getMaskFunction: function (maskPattern: number) {
        switch (maskPattern) {
          case 0:
            return function (i: number, j: number) {
              return (i + j) % 2 == 0;
            };
          case 1:
            return function (i: number) {
              return i % 2 == 0;
            };
          case 2:
            return function (_i: number, j: number) {
              return j % 3 == 0;
            };
          case 3:
            return function (i: number, j: number) {
              return (i + j) % 3 == 0;
            };
          case 4:
            return function (i: number, j: number) {
              return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 == 0;
            };
          case 5:
            return function (i: number, j: number) {
              return ((i * j) % 2) + ((i * j) % 3) == 0;
            };
          case 6:
            return function (i: number, j: number) {
              return (((i * j) % 2) + ((i * j) % 3)) % 2 == 0;
            };
          case 7:
            return function (i: number, j: number) {
              return (((i * j) % 3) + ((i + j) % 2)) % 2 == 0;
            };
          default:
            throw new Error('bad maskPattern:' + maskPattern);
        }
      },
      getErrorCorrectPolynomial: function (errorCorrectLength: number) {
        let a = new (QRPolynomial as any)([1], 0);
        for (let i = 0; i < errorCorrectLength; i++) {
          a = a.multiply(new (QRPolynomial as any)([1, QRMath.gexp(i)], 0));
        }
        return a;
      },
      getLengthInBits: function (mode: number, type: number) {
        if (1 <= type && type < 10) return mode === 4 ? 8 : mode === 2 ? 9 : 10;
        return mode === 4 ? 16 : mode === 2 ? 11 : 12;
      },
      getLostPoint: function (qrCode: any) {
        const moduleCount = qrCode.getModuleCount();
        let lostPoint = 0;
        for (let row = 0; row < moduleCount; row++) {
          for (let col = 0; col < moduleCount; col++) {
            let sameCount = 0;
            const dark = qrCode.isDark(row, col);
            for (let r = -1; r <= 1; r++) {
              if (row + r < 0 || moduleCount <= row + r) continue;
              for (let c = -1; c <= 1; c++) {
                if (col + c < 0 || moduleCount <= col + c || (r == 0 && c == 0)) continue;
                if (dark == qrCode.isDark(row + r, col + c)) sameCount++;
              }
            }
            if (sameCount > 5) lostPoint += 3 + sameCount - 5;
          }
        }
        return lostPoint;
      },
    };

    const QRMath: any = {
      glog: function (n: number) {
        if (n < 1) throw new Error('glog(' + n + ')');
        return QRMath.LOG_TABLE[n];
      },
      gexp: function (n: number) {
        while (n < 0) n += 255;
        while (n >= 256) n -= 255;
        return QRMath.EXP_TABLE[n];
      },
      EXP_TABLE: new Array(256),
      LOG_TABLE: new Array(256),
    };
    for (let i = 0; i < 8; i++) QRMath.EXP_TABLE[i] = 1 << i;
    for (let i = 8; i < 256; i++)
      QRMath.EXP_TABLE[i] =
        QRMath.EXP_TABLE[i - 4] ^ QRMath.EXP_TABLE[i - 5] ^ QRMath.EXP_TABLE[i - 6] ^ QRMath.EXP_TABLE[i - 8];
    for (let i = 0; i < 255; i++) QRMath.LOG_TABLE[QRMath.EXP_TABLE[i]] = i;

    function QRPolynomial(this: any, num: any[], shift: number) {
      let offset = 0;
      while (offset < num.length && num[offset] == 0) offset++;
      this.num = new Array(num.length - offset + shift);
      for (let i = 0; i < num.length - offset; i++) this.num[i] = num[i + offset];
    }
    QRPolynomial.prototype = {
      get: function (this: any, index: number) {
        return this.num[index];
      },
      getLength: function (this: any) {
        return this.num.length;
      },
      multiply: function (this: any, e: any) {
        const num = new Array(this.getLength() + e.getLength() - 1);
        for (let i = 0; i < this.getLength(); i++) {
          for (let j = 0; j < e.getLength(); j++) {
            num[i + j] ^= QRMath.gexp(QRMath.glog(this.get(i)) + QRMath.glog(e.get(j)));
          }
        }
        return new (QRPolynomial as any)(num, 0);
      },
      mod: function (this: any, e: any) {
        if (this.getLength() - e.getLength() < 0) return this;
        const ratio = QRMath.glog(this.get(0)) - QRMath.glog(e.get(0));
        const num = new Array(this.getLength());
        for (let i = 0; i < this.getLength(); i++) num[i] = this.get(i);
        for (let i = 0; i < e.getLength(); i++) num[i] ^= QRMath.gexp(QRMath.glog(e.get(i)) + ratio);
        return new (QRPolynomial as any)(num, 0).mod(e);
      },
    };

    function QRRSBlock(this: any, totalCount: number, dataCount: number) {
      this.totalCount = totalCount;
      this.dataCount = dataCount;
    }
    (QRRSBlock as any).RS_BLOCK_TABLE = [
      [1, 26, 19],
      [1, 26, 16],
      [1, 26, 13],
      [1, 26, 9],
      [1, 44, 34],
      [1, 44, 28],
      [1, 44, 22],
      [1, 44, 16],
      [1, 70, 55],
      [1, 70, 44],
      [2, 35, 17],
      [2, 35, 13],
      [1, 100, 80],
      [2, 50, 32],
      [2, 50, 24],
      [4, 25, 9],
      [1, 134, 108],
      [2, 67, 43],
      [2, 33, 15, 2, 34, 16],
      [2, 33, 11, 2, 34, 12],
      [2, 86, 68],
      [4, 43, 27],
      [4, 43, 19],
      [4, 43, 15],
    ];
    (QRRSBlock as any).getRSBlocks = function (typeNumber: number, errorCorrectionLevel: number) {
      const table = (QRRSBlock as any).RS_BLOCK_TABLE[(typeNumber - 1) * 4 + errorCorrectionLevel];
      if (!table) return [new (QRRSBlock as any)(100, 80)];
      const length = table.length / 3,
        list = [];
      for (let i = 0; i < length; i++) {
        for (let j = 0; j < table[i * 3 + 0]; j++)
          list.push(new (QRRSBlock as any)(table[i * 3 + 1], table[i * 3 + 2]));
      }
      return list;
    };

    function QRBitBuffer(this: any) {
      this.buffer = [];
      this.length = 0;
    }
    QRBitBuffer.prototype = {
      put: function (this: any, num: number, length: number) {
        for (let i = 0; i < length; i++) this.putBit(((num >>> (length - i - 1)) & 1) == 1);
      },
      getLengthInBits: function (this: any) {
        return this.length;
      },
      putBit: function (this: any, bit: boolean) {
        const bufIndex = Math.floor(this.length / 8);
        if (this.buffer.length <= bufIndex) this.buffer.push(0);
        if (bit) this.buffer[bufIndex] |= 0x80 >>> (this.length % 8);
        this.length++;
      },
    };

    const qr = new (QRCode as any)(opts.typeNumber || 0, opts.errorCorrectionLevel !== undefined ? opts.errorCorrectionLevel : 0);
    qr.addData(String(text || ''));
    qr.make();
    return qr.createSvgTag(cellSize, margin);
  } catch {
    return `<div style="width:36px;height:36px;border:1px dashed #94A3B8;display:flex;align-items:center;justify-content:center;font-size:7px;color:#64748B;">[QR]</div>`;
  }
}
