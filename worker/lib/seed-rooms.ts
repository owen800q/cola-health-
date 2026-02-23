// Auto-seed baby care rooms data into D1
// This ensures the table exists and has data even if schema.sql wasn't re-run

let _initialized = false;

interface RoomSeed {
  name: string;
  name_en: string;
  district: string;
  region: string;
  address: string;
  type: string;
  facilities: string;
}

const SEED_DATA: RoomSeed[] = [
  // ===== 港島 - 中西區 =====
  { name: 'IFC 國際金融中心商場', name_en: 'IFC Mall', district: '中西區', region: '港島', address: '中環金融街8號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  { name: '置地廣場', name_en: 'The Landmark', district: '中西區', region: '港島', address: '中環皇后大道中15號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆"]' },
  { name: '太子大廈', name_en: "Prince's Building", district: '中西區', region: '港島', address: '中環遮打道10號', type: '商場', facilities: '["換片台","洗手盆"]' },
  { name: '中環中心', name_en: 'The Center', district: '中西區', region: '港島', address: '皇后大道中99號', type: '商場', facilities: '["換片台","洗手盆"]' },
  { name: '西港城', name_en: 'Western Market', district: '中西區', region: '港島', address: '上環德輔道中323號', type: '商場', facilities: '["換片台"]' },
  { name: '港鐵中環站', name_en: 'MTR Central Station', district: '中西區', region: '港島', address: '中環畢打街', type: '交通', facilities: '["換片台","洗手盆"]' },
  { name: '港鐵香港站', name_en: 'MTR Hong Kong Station', district: '中西區', region: '港島', address: '中環民耀街', type: '交通', facilities: '["換片台","洗手盆"]' },
  { name: '中西區健康院', name_en: 'Central & Western Health Centre', district: '中西區', region: '港島', address: '西營盤皇后大道西134號', type: '政府', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  { name: '香港大會堂', name_en: 'Hong Kong City Hall', district: '中西區', region: '港島', address: '中環愛丁堡廣場5號', type: '政府', facilities: '["換片台","洗手盆"]' },
  { name: '山頂廣場', name_en: 'The Peak Galleria', district: '中西區', region: '港島', address: '山頂道118號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆"]' },
  { name: '凌霄閣', name_en: 'Peak Tower', district: '中西區', region: '港島', address: '山頂山頂道128號', type: '商場', facilities: '["換片台","洗手盆"]' },
  // ===== 港島 - 灣仔 =====
  { name: '太古廣場', name_en: 'Pacific Place', district: '灣仔', region: '港島', address: '金鐘道88號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  { name: '金鐘廊', name_en: 'Queensway Plaza', district: '灣仔', region: '港島', address: '金鐘道93號', type: '商場', facilities: '["換片台","洗手盆"]' },
  { name: '灣仔電腦城', name_en: 'Wan Chai Computer Centre', district: '灣仔', region: '港島', address: '灣仔軒尼詩道130號', type: '商場', facilities: '["換片台"]' },
  { name: '合和中心', name_en: 'Hopewell Centre', district: '灣仔', region: '港島', address: '灣仔皇后大道東183號', type: '商場', facilities: '["換片台","洗手盆"]' },
  { name: '利東街', name_en: 'Lee Tung Avenue', district: '灣仔', region: '港島', address: '灣仔皇后大道東200號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆"]' },
  { name: '港鐵金鐘站', name_en: 'MTR Admiralty Station', district: '灣仔', region: '港島', address: '金鐘夏慤道', type: '交通', facilities: '["換片台","洗手盆"]' },
  { name: '港鐵灣仔站', name_en: 'MTR Wan Chai Station', district: '灣仔', region: '港島', address: '灣仔軒尼詩道', type: '交通', facilities: '["換片台","洗手盆"]' },
  { name: '灣仔母嬰健康院', name_en: 'Wan Chai MCHC', district: '灣仔', region: '港島', address: '灣仔石水渠街12號', type: '政府', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  { name: '入境事務處總部', name_en: 'Immigration Tower', district: '灣仔', region: '港島', address: '灣仔告士打道7號', type: '政府', facilities: '["換片台","洗手盆"]' },
  { name: '時代廣場', name_en: 'Times Square', district: '灣仔', region: '港島', address: '銅鑼灣勿地臣街1號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  { name: '希慎廣場', name_en: 'Hysan Place', district: '灣仔', region: '港島', address: '銅鑼灣軒尼詩道500號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  { name: '銅鑼灣廣場', name_en: 'Causeway Bay Plaza', district: '灣仔', region: '港島', address: '銅鑼灣軒尼詩道489號', type: '商場', facilities: '["換片台","洗手盆"]' },
  { name: '皇室堡', name_en: 'Windsor House', district: '灣仔', region: '港島', address: '銅鑼灣告士打道311號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆"]' },
  { name: '世貿中心', name_en: 'World Trade Centre', district: '灣仔', region: '港島', address: '銅鑼灣告士打道280號', type: '商場', facilities: '["換片台","洗手盆"]' },
  { name: '崇光百貨 (銅鑼灣)', name_en: 'SOGO Causeway Bay', district: '灣仔', region: '港島', address: '銅鑼灣軒尼詩道555號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆"]' },
  { name: '港鐵銅鑼灣站', name_en: 'MTR Causeway Bay Station', district: '灣仔', region: '港島', address: '銅鑼灣軒尼詩道', type: '交通', facilities: '["換片台","洗手盆"]' },
  // ===== 港島 - 東區 =====
  { name: '太古城中心', name_en: 'Cityplaza', district: '東區', region: '港島', address: '太古城太古城道18號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  { name: '康怡廣場', name_en: 'Kornhill Plaza', district: '東區', region: '港島', address: '鰂魚涌康山道2號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆"]' },
  { name: '港島東中心', name_en: 'One Island East', district: '東區', region: '港島', address: '太古坊鰂魚涌英皇道979號', type: '商場', facilities: '["換片台","洗手盆"]' },
  { name: '杏花新城', name_en: 'Paradise Mall', district: '東區', region: '港島', address: '柴灣盛泰道100號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆"]' },
  { name: '新翠商場', name_en: 'Aldrich Garden Shopping Centre', district: '東區', region: '港島', address: '筲箕灣愛秩序灣道18號', type: '商場', facilities: '["換片台","洗手盆"]' },
  { name: '港鐵太古站', name_en: 'MTR Tai Koo Station', district: '東區', region: '港島', address: '太古康山道', type: '交通', facilities: '["換片台","洗手盆"]' },
  { name: '柴灣母嬰健康院', name_en: 'Chai Wan MCHC', district: '東區', region: '港島', address: '柴灣翠灣街18號', type: '政府', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  { name: '東區醫院', name_en: 'Pamela Youde Nethersole Eastern Hospital', district: '東區', region: '港島', address: '柴灣樂民道3號', type: '醫院', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  // ===== 港島 - 南區 =====
  { name: '數碼港商場', name_en: 'Cyberport Arcade', district: '南區', region: '港島', address: '數碼港道100號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆"]' },
  { name: '淺水灣影灣園', name_en: 'The Repulse Bay', district: '南區', region: '港島', address: '淺水灣灘道109號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆"]' },
  { name: '赤柱廣場', name_en: 'Stanley Plaza', district: '南區', region: '港島', address: '赤柱佳美道23號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆"]' },
  { name: '香港仔中心', name_en: 'Aberdeen Centre', district: '南區', region: '港島', address: '香港仔南寧街9號', type: '商場', facilities: '["換片台","洗手盆"]' },
  { name: '利東商場', name_en: 'Lei Tung Commercial Centre', district: '南區', region: '港島', address: '鴨脷洲利東邨道', type: '商場', facilities: '["換片台","洗手盆"]' },
  { name: '海洋公園', name_en: 'Ocean Park', district: '南區', region: '港島', address: '黃竹坑道180號', type: '其他', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  // ===== 九龍 - 油尖旺 =====
  { name: '海港城', name_en: 'Harbour City', district: '油尖旺', region: '九龍', address: '尖沙咀廣東道3-27號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  { name: '1881 Heritage', name_en: '1881 Heritage', district: '油尖旺', region: '九龍', address: '尖沙咀廣東道2A號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆"]' },
  { name: 'K11 MUSEA', name_en: 'K11 MUSEA', district: '油尖旺', region: '九龍', address: '尖沙咀梳士巴利道18號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆","熱水供應","微波爐"]' },
  { name: 'K11 Art Mall', name_en: 'K11 Art Mall', district: '油尖旺', region: '九龍', address: '尖沙咀河內道18號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆"]' },
  { name: 'iSQUARE 國際廣場', name_en: 'iSQUARE', district: '油尖旺', region: '九龍', address: '尖沙咀彌敦道63號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆"]' },
  { name: 'The ONE', name_en: 'The ONE', district: '油尖旺', region: '九龍', address: '尖沙咀彌敦道100號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆"]' },
  { name: '美麗華商場', name_en: 'Mira Place', district: '油尖旺', region: '九龍', address: '尖沙咀彌敦道132號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆"]' },
  { name: 'DFS T廣場 (廣東道)', name_en: 'DFS T Galleria', district: '油尖旺', region: '九龍', address: '尖沙咀廣東道28號', type: '商場', facilities: '["換片台","洗手盆"]' },
  { name: '中港城', name_en: 'China Hong Kong City', district: '油尖旺', region: '九龍', address: '尖沙咀廣東道33號', type: '商場', facilities: '["換片台","洗手盆"]' },
  { name: '新世紀廣場', name_en: 'Grand Century Place', district: '油尖旺', region: '九龍', address: '旺角太子道西193號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆"]' },
  { name: '朗豪坊', name_en: 'Langham Place', district: '油尖旺', region: '九龍', address: '旺角亞皆老街8號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  { name: 'MOKO 新世紀廣場', name_en: 'MOKO', district: '油尖旺', region: '九龍', address: '旺角太子道西193號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆"]' },
  { name: '圓方', name_en: 'Elements', district: '油尖旺', region: '九龍', address: '柯士甸道西1號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  { name: '港鐵尖沙咀站', name_en: 'MTR Tsim Sha Tsui Station', district: '油尖旺', region: '九龍', address: '尖沙咀彌敦道', type: '交通', facilities: '["換片台","洗手盆"]' },
  { name: '港鐵旺角站', name_en: 'MTR Mong Kok Station', district: '油尖旺', region: '九龍', address: '旺角彌敦道', type: '交通', facilities: '["換片台","洗手盆"]' },
  { name: '港鐵九龍站', name_en: 'MTR Kowloon Station', district: '油尖旺', region: '九龍', address: '柯士甸道西', type: '交通', facilities: '["換片台","洗手盆"]' },
  { name: '油麻地母嬰健康院', name_en: 'Yau Ma Tei MCHC', district: '油尖旺', region: '九龍', address: '油麻地炮台街145號', type: '政府', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  // ===== 九龍 - 深水埗 =====
  { name: '西九龍中心', name_en: 'Dragon Centre', district: '深水埗', region: '九龍', address: '深水埗欽州街37K號', type: '商場', facilities: '["換片台","洗手盆"]' },
  { name: 'V Walk', name_en: 'V Walk', district: '深水埗', region: '九龍', address: '深水埗深旺道28號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  { name: '港鐵南昌站', name_en: 'MTR Nam Cheong Station', district: '深水埗', region: '九龍', address: '深水埗深旺道', type: '交通', facilities: '["換片台","洗手盆"]' },
  { name: '長沙灣母嬰健康院', name_en: 'Cheung Sha Wan MCHC', district: '深水埗', region: '九龍', address: '長沙灣長裕街8號', type: '政府', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  // ===== 九龍 - 九龍城 =====
  { name: '又一城', name_en: 'Festival Walk', district: '九龍城', region: '九龍', address: '九龍塘達之路80號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  { name: '黃埔新天地', name_en: 'Whampoa Garden', district: '九龍城', region: '九龍', address: '紅磡黃埔花園德安街', type: '商場', facilities: '["換片台","哺乳椅","洗手盆"]' },
  { name: 'Mikiki', name_en: 'Mikiki', district: '九龍城', region: '九龍', address: '新蒲崗太子道東638號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆"]' },
  { name: '啟德郵輪碼頭', name_en: 'Kai Tak Cruise Terminal', district: '九龍城', region: '九龍', address: '啟德承豐道33號', type: '其他', facilities: '["換片台","洗手盆"]' },
  { name: '港鐵九龍塘站', name_en: 'MTR Kowloon Tong Station', district: '九龍城', region: '九龍', address: '九龍塘多福道', type: '交通', facilities: '["換片台","洗手盆"]' },
  { name: '伊利沙伯醫院', name_en: 'Queen Elizabeth Hospital', district: '九龍城', region: '九龍', address: '京士柏加士居道30號', type: '醫院', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  { name: '紅磡母嬰健康院', name_en: 'Hung Hom MCHC', district: '九龍城', region: '九龍', address: '紅磡差館里22號', type: '政府', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  // ===== 九龍 - 黃大仙 =====
  { name: '黃大仙中心', name_en: 'Temple Mall', district: '黃大仙', region: '九龍', address: '黃大仙龍翔道136號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆"]' },
  { name: '荷里活廣場', name_en: 'Hollywood Plaza', district: '黃大仙', region: '九龍', address: '鑽石山龍蟠街3號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆"]' },
  { name: '現崇山商場', name_en: 'Aria', district: '黃大仙', region: '九龍', address: '慈雲山毓華街23號', type: '商場', facilities: '["換片台","洗手盆"]' },
  { name: '樂富廣場', name_en: 'Lok Fu Place', district: '黃大仙', region: '九龍', address: '樂富橫頭磡聯合道198號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆"]' },
  { name: '港鐵黃大仙站', name_en: 'MTR Wong Tai Sin Station', district: '黃大仙', region: '九龍', address: '黃大仙龍翔道', type: '交通', facilities: '["換片台","洗手盆"]' },
  // ===== 九龍 - 觀塘 =====
  { name: 'apm', name_en: 'apm', district: '觀塘', region: '九龍', address: '觀塘觀塘道418號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  { name: 'MegaBox', name_en: 'MegaBox', district: '觀塘', region: '九龍', address: '九龍灣宏照道38號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  { name: '德福廣場', name_en: 'Telford Plaza', district: '觀塘', region: '九龍', address: '九龍灣偉業街33號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆"]' },
  { name: '淘大商場', name_en: 'Amoy Plaza', district: '觀塘', region: '九龍', address: '九龍灣牛頭角道77號', type: '商場', facilities: '["換片台","洗手盆"]' },
  { name: '裕民坊', name_en: 'Yue Man Square', district: '觀塘', region: '九龍', address: '觀塘裕民坊', type: '商場', facilities: '["換片台","哺乳椅","洗手盆"]' },
  { name: '觀塘廣場', name_en: 'Kwun Tong Plaza', district: '觀塘', region: '九龍', address: '觀塘開源道72號', type: '商場', facilities: '["換片台","洗手盆"]' },
  { name: '創紀之城五期', name_en: 'Millennium City 5', district: '觀塘', region: '九龍', address: '觀塘觀塘道378號', type: '商場', facilities: '["換片台","洗手盆"]' },
  { name: '港鐵觀塘站', name_en: 'MTR Kwun Tong Station', district: '觀塘', region: '九龍', address: '觀塘觀塘道', type: '交通', facilities: '["換片台","洗手盆"]' },
  { name: '觀塘母嬰健康院', name_en: 'Kwun Tong MCHC', district: '觀塘', region: '九龍', address: '觀塘翠屏道3號', type: '政府', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  { name: '聯合醫院', name_en: 'United Christian Hospital', district: '觀塘', region: '九龍', address: '觀塘協和街130號', type: '醫院', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  // ===== 新界 - 沙田 =====
  { name: '新城市廣場', name_en: 'New Town Plaza', district: '沙田', region: '新界', address: '沙田正街18號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  { name: '沙田中心', name_en: 'Sha Tin Centre', district: '沙田', region: '新界', address: '沙田正街2-16號', type: '商場', facilities: '["換片台","洗手盆"]' },
  { name: 'HomeSquare', name_en: 'HomeSquare', district: '沙田', region: '新界', address: '沙田沙田鄉事會路138號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆"]' },
  { name: '馬鞍山廣場', name_en: 'Ma On Shan Plaza', district: '沙田', region: '新界', address: '馬鞍山鞍祿街18號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆"]' },
  { name: '新港城中心', name_en: 'Sunshine City Plaza', district: '沙田', region: '新界', address: '馬鞍山鞍誠街18號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆"]' },
  { name: '連城廣場', name_en: 'Link Square', district: '沙田', region: '新界', address: '大圍車公廟路68號', type: '商場', facilities: '["換片台","洗手盆"]' },
  { name: '港鐵沙田站', name_en: 'MTR Sha Tin Station', district: '沙田', region: '新界', address: '沙田排頭街', type: '交通', facilities: '["換片台","洗手盆"]' },
  { name: '沙田母嬰健康院', name_en: 'Sha Tin MCHC', district: '沙田', region: '新界', address: '沙田大圍文禮路12號', type: '政府', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  { name: '威爾斯親王醫院', name_en: 'Prince of Wales Hospital', district: '沙田', region: '新界', address: '沙田銀城街30-32號', type: '醫院', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  // ===== 新界 - 荃灣 =====
  { name: '荃灣廣場', name_en: 'Tsuen Wan Plaza', district: '荃灣', region: '新界', address: '荃灣大河道88號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  { name: '荃新天地', name_en: 'Citywalk', district: '荃灣', region: '新界', address: '荃灣楊屋道1號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  { name: '如心廣場', name_en: 'Nina Tower', district: '荃灣', region: '新界', address: '荃灣楊屋道8號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆"]' },
  { name: 'D.PARK 愉景新城', name_en: 'D.PARK', district: '荃灣', region: '新界', address: '荃灣青山公路398號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆","熱水供應","兒童遊樂區"]' },
  { name: '南豐紗廠', name_en: 'The Mills', district: '荃灣', region: '新界', address: '荃灣白田壩街45號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆"]' },
  { name: '港鐵荃灣站', name_en: 'MTR Tsuen Wan Station', district: '荃灣', region: '新界', address: '荃灣西樓角路', type: '交通', facilities: '["換片台","洗手盆"]' },
  { name: '荃灣母嬰健康院', name_en: 'Tsuen Wan MCHC', district: '荃灣', region: '新界', address: '荃灣蕙荃路22-66號', type: '政府', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  // ===== 新界 - 葵青 =====
  { name: '新都會廣場', name_en: 'Metroplaza', district: '葵青', region: '新界', address: '葵芳興芳路223號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆"]' },
  { name: '葵涌廣場', name_en: 'Kwai Chung Plaza', district: '葵青', region: '新界', address: '葵涌葵富路7-11號', type: '商場', facilities: '["換片台","洗手盆"]' },
  { name: '青衣城', name_en: 'Maritime Square', district: '葵青', region: '新界', address: '青衣青敬路33號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  { name: '港鐵葵芳站', name_en: 'MTR Kwai Fong Station', district: '葵青', region: '新界', address: '葵芳興芳路', type: '交通', facilities: '["換片台","洗手盆"]' },
  { name: '瑪嘉烈醫院', name_en: 'Princess Margaret Hospital', district: '葵青', region: '新界', address: '葵涌荔景山路2-10號', type: '醫院', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  // ===== 新界 - 屯門 =====
  { name: '屯門市廣場', name_en: 'Tuen Mun Town Plaza', district: '屯門', region: '新界', address: '屯門屯順街1號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  { name: 'V city', name_en: 'V city', district: '屯門', region: '新界', address: '屯門屯門鄉事會路83號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  { name: '屯門時代廣場', name_en: 'Tuen Mun Times Square', district: '屯門', region: '新界', address: '屯門屯門鄉事會路2號', type: '商場', facilities: '["換片台","洗手盆"]' },
  { name: '黃金海岸商場', name_en: 'Gold Coast Piazza', district: '屯門', region: '新界', address: '屯門掃管笏青山公路1號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆"]' },
  { name: '港鐵屯門站', name_en: 'MTR Tuen Mun Station', district: '屯門', region: '新界', address: '屯門杯渡路', type: '交通', facilities: '["換片台","洗手盆"]' },
  { name: '屯門母嬰健康院', name_en: 'Tuen Mun MCHC', district: '屯門', region: '新界', address: '屯門屯利街6號', type: '政府', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  { name: '屯門醫院', name_en: 'Tuen Mun Hospital', district: '屯門', region: '新界', address: '屯門青松觀路23號', type: '醫院', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  // ===== 新界 - 元朗 =====
  { name: 'YOHO MALL 形點', name_en: 'YOHO MALL', district: '元朗', region: '新界', address: '元朗朗日路9號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  { name: '元朗廣場', name_en: 'Yuen Long Plaza', district: '元朗', region: '新界', address: '元朗青山公路249-251號', type: '商場', facilities: '["換片台","洗手盆"]' },
  { name: '新元朗中心', name_en: 'Sun Yuen Long Centre', district: '元朗', region: '新界', address: '元朗青山公路269號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆"]' },
  { name: '天水圍嘉湖銀座', name_en: 'Kingswood Ginza', district: '元朗', region: '新界', address: '天水圍天恩路12-18號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆"]' },
  { name: '+WOO嘉湖', name_en: '+WOO Kingswood', district: '元朗', region: '新界', address: '天水圍天華路30-33號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  { name: '港鐵元朗站', name_en: 'MTR Yuen Long Station', district: '元朗', region: '新界', address: '元朗朗日路', type: '交通', facilities: '["換片台","洗手盆"]' },
  { name: '元朗母嬰健康院', name_en: 'Yuen Long MCHC', district: '元朗', region: '新界', address: '元朗青山公路150號', type: '政府', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  // ===== 新界 - 北區 =====
  { name: '上水廣場', name_en: 'Landmark North', district: '北區', region: '新界', address: '上水龍琛路39號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆"]' },
  { name: '粉嶺名都', name_en: 'Fanling Town Center', district: '北區', region: '新界', address: '粉嶺車站路18號', type: '商場', facilities: '["換片台","洗手盆"]' },
  { name: '彩園廣場', name_en: 'Choi Yuen Plaza', district: '北區', region: '新界', address: '上水彩園路', type: '商場', facilities: '["換片台","洗手盆"]' },
  { name: '港鐵上水站', name_en: 'MTR Sheung Shui Station', district: '北區', region: '新界', address: '上水新運路', type: '交通', facilities: '["換片台","洗手盆"]' },
  { name: '粉嶺母嬰健康院', name_en: 'Fanling MCHC', district: '北區', region: '新界', address: '粉嶺璧峰路2號', type: '政府', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  { name: '北區醫院', name_en: 'North District Hospital', district: '北區', region: '新界', address: '上水保健路9號', type: '醫院', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  // ===== 新界 - 大埔 =====
  { name: '大埔超級城', name_en: 'Tai Po Mega Mall', district: '大埔', region: '新界', address: '大埔安邦路8-10號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  { name: '大埔廣場', name_en: 'Tai Po Plaza', district: '大埔', region: '新界', address: '大埔新達廣場', type: '商場', facilities: '["換片台","洗手盆"]' },
  { name: '港鐵大埔墟站', name_en: 'MTR Tai Po Market Station', district: '大埔', region: '新界', address: '大埔南運路', type: '交通', facilities: '["換片台","洗手盆"]' },
  { name: '大埔母嬰健康院', name_en: 'Tai Po MCHC', district: '大埔', region: '新界', address: '大埔汀角路6號', type: '政府', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  // ===== 新界 - 西貢 =====
  { name: '將軍澳廣場', name_en: 'TKO Gateway', district: '西貢', region: '新界', address: '將軍澳唐德街1號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆"]' },
  { name: 'PopCorn 商場', name_en: 'PopCorn', district: '西貢', region: '新界', address: '將軍澳唐賢街9號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  { name: '東港城', name_en: 'East Point City', district: '西貢', region: '新界', address: '將軍澳唐明街1號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆"]' },
  { name: '新都城中心', name_en: 'Metro City Plaza', district: '西貢', region: '新界', address: '將軍澳寶林邨貿業路8號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆"]' },
  { name: '將軍澳中心', name_en: 'Park Central', district: '西貢', region: '新界', address: '將軍澳唐賢街', type: '商場', facilities: '["換片台","洗手盆"]' },
  { name: '港鐵將軍澳站', name_en: 'MTR Tseung Kwan O Station', district: '西貢', region: '新界', address: '將軍澳唐賢街', type: '交通', facilities: '["換片台","洗手盆"]' },
  { name: '將軍澳母嬰健康院', name_en: 'Tseung Kwan O MCHC', district: '西貢', region: '新界', address: '將軍澳寶寧路22號', type: '政府', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  // ===== 新界 - 離島 =====
  { name: '東薈城名店倉', name_en: 'Citygate Outlets', district: '離島', region: '新界', address: '東涌達東路20號', type: '商場', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
  { name: '昂坪360市集', name_en: 'Ngong Ping Village', district: '離島', region: '新界', address: '大嶼山昂坪', type: '其他', facilities: '["換片台","洗手盆"]' },
  { name: '香港迪士尼樂園', name_en: 'Hong Kong Disneyland', district: '離島', region: '新界', address: '大嶼山竹篙灣', type: '其他', facilities: '["換片台","哺乳椅","洗手盆","熱水供應","微波爐"]' },
  { name: '港鐵東涌站', name_en: 'MTR Tung Chung Station', district: '離島', region: '新界', address: '東涌達東路', type: '交通', facilities: '["換片台","洗手盆"]' },
  { name: '港鐵迪士尼站', name_en: 'MTR Disneyland Resort Station', district: '離島', region: '新界', address: '大嶼山迪士尼', type: '交通', facilities: '["換片台","洗手盆"]' },
  { name: '香港國際機場', name_en: 'Hong Kong International Airport', district: '離島', region: '新界', address: '赤鱲角翔天路1號', type: '交通', facilities: '["換片台","哺乳椅","洗手盆","熱水供應","微波爐"]' },
  { name: '北大嶼山醫院', name_en: 'North Lantau Hospital', district: '離島', region: '新界', address: '東涌松仁路8號', type: '醫院', facilities: '["換片台","哺乳椅","洗手盆","熱水供應"]' },
];

export async function ensureRoomsTable(db: D1Database): Promise<void> {
  if (_initialized) return;

  // Create table if not exists
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS babycare_rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      name_en TEXT,
      district TEXT NOT NULL,
      region TEXT NOT NULL,
      address TEXT,
      type TEXT NOT NULL,
      facilities TEXT,
      hours TEXT,
      source TEXT DEFAULT 'seed',
      source_url TEXT,
      lat REAL,
      lng REAL,
      verified INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `).run();

  await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_name_district ON babycare_rooms(name, district)`).run();

  // Check if table is empty
  const count = await db.prepare('SELECT COUNT(*) as c FROM babycare_rooms').first<{ c: number }>();
  if (count && count.c > 0) {
    _initialized = true;
    return;
  }

  // Seed data in batches (D1 batch limit)
  const BATCH_SIZE = 25;
  for (let i = 0; i < SEED_DATA.length; i += BATCH_SIZE) {
    const batch = SEED_DATA.slice(i, i + BATCH_SIZE);
    const stmt = db.prepare(
      `INSERT OR IGNORE INTO babycare_rooms (name, name_en, district, region, address, type, facilities, source) VALUES (?, ?, ?, ?, ?, ?, ?, 'seed')`
    );
    await db.batch(batch.map(r => stmt.bind(r.name, r.name_en, r.district, r.region, r.address, r.type, r.facilities)));
  }

  // Also ensure data_sync_log table
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS data_sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sync_type TEXT NOT NULL,
      status TEXT NOT NULL,
      records_added INTEGER DEFAULT 0,
      records_updated INTEGER DEFAULT 0,
      error_msg TEXT,
      started_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    )
  `).run();

  _initialized = true;
}
