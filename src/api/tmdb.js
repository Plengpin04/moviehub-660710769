// ชั้นกลางสำหรับคุยกับ TMDB ทุกหน้าเรียกผ่านไฟล์นี้เท่านั้น (หน้าอื่นไม่ต้องรู้จัก URL หรือ key)
import { onceADay } from './cache';

const BASE = 'https://api.themoviedb.org/3';
const KEY = process.env.REACT_APP_TMDB_KEY;          // มาจากไฟล์ .env
export const IMG = 'https://image.tmdb.org/t/p/w342'; // ต้นทางรูปโปสเตอร์
export const CACHE_KEY = 'moviehub.movies';          // ชื่อกล่องใน localStorage

// ตัวช่วยกลาง: ประกอบ URL, แนบ key, ส่ง request, เช็กผล, แปลงเป็น object
export async function getJSON(path, params = {}) {
  const url = new URL(BASE + path);
  url.searchParams.set('api_key', KEY);
  url.searchParams.set('language', 'th-TH');
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value);               // เข้ารหัสภาษาไทยและช่องว่างให้เอง
  }

  // TODO ขั้นที่ 1: ส่ง request ด้วย fetch(url) แล้วรอคำตอบ
  const res = await fetch(url);
  
  // เช็กว่าสถานะการตอบกลับตอบกลับด้วย 2xx หรือไม่ (ถ้าไม่จริง ให้ throw error พร้อม status code)
  if (!res.ok) {
    throw new Error(`ยิง API ไม่สำเร็จ HTTP Status: ${res.status}`);
  }

  // แปลงและคืนค่า JSON เป็น JavaScript Object
  return await res.json();
}

// แปลง JSON ของ TMDB ให้เป็นรูปร่างเดียวกับ data.js เพื่อให้ MovieCard ใช้ได้ทันที
// genreMap คือตาราง { 28: 'แอ็คชั่น', 16: 'แอนิเมชัน', ... } เพราะรายการหนังให้มาแค่รหัสแนว (genre_ids)
export function toMovie(m, genreMap = {}) {
  // TODO ขั้นที่ 2: คืน object ที่ตรงตามโครงสร้างของแอป MovieHub
  
  // จัดการเรื่องแนวหนัง (genre) เพื่อป้องกัน undefined
  let genreName = 'ทั่วไป';
  if (m.genres && m.genres.length > 0) {
    genreName = m.genres[0].name;
  } else if (m.genre_ids && m.genre_ids.length > 0) {
    genreName = genreMap[m.genre_ids[0]] || 'ทั่วไป';
  }

  // ตัดเอาเฉพาะปี ค.ศ. (4 ตัวแรก)
  const yearNum = m.release_date ? Number(m.release_date.slice(0, 4)) : null;

  // ปัดคะแนนเรตติ้งให้เหลือทศนิยม 1 ตำแหน่ง
  const ratingNum = m.vote_average ? Number(m.vote_average.toFixed(1)) : 0;

  return {
    id: m.id,
    tmdbId: m.id,
    title: m.title || 'ไม่มีชื่อเรื่อง',
    titleTh: null,
    genre: genreName,
    year: yearNum,
    rating: ratingNum,
    detail: m.overview || 'ไม่มีข้อมูลเรื่องย่อ',
    poster: m.poster_path ? `${IMG}${m.poster_path}` : null,
  };
}

// ตารางแปลงรหัสแนวหนังเป็นชื่อ (โหลดครั้งเดียวต่อการเรียก getNowPlaying)
async function getGenreMap() {
  const data = await getJSON('/genre/movie/list');
  const map = {};
  for (const g of data.genres) map[g.id] = g.name;   // [{id: 28, name: 'แอ็คชั่น'}, ...] เป็น {28: 'แอ็คชั่น'}
  return map;
}

// หนังที่กำลังฉายในไทย ดึงมาหลายหน้า (TMDB ให้หน้าละ 20 เรื่อง) แล้วต่อเป็น array เดียว
export async function getNowPlaying(pages = 3) {
  const genreMap = await getGenreMap();
  const all = [];
  for (let page = 1; page <= pages; page++) {
    const data = await getJSON('/movie/now_playing', { region: 'TH', page });
    all.push(...data.results);
    if (page >= data.total_pages) break;             // มีไม่ถึง 3 หน้าก็หยุด
  }
  const unique = [...new Map(all.map(m => [m.id, m])).values()];  // กันเรื่องซ้ำข้ามหน้า
  return unique.map(m => toMovie(m, genreMap));
}

// "หนังทั้งหมดที่แอปใช้" โหลดจริงวันละครั้ง ที่เหลืออ่านจาก localStorage
// หน้า Movies และหน้าแรกเรียกตัวนี้ จึงแชร์ข้อมูลชุดเดียวกัน
export function getMovies() {
  return onceADay(CACHE_KEY, () => getNowPlaying());
}

// ค้นหาที่ server (ใช้ในหน้า API Lab เพื่อดู JSON ดิบ หน้า Movies กรองในเครื่องแทน)
export async function searchMovies(query) {
  const data = await getJSON('/search/movie', { query });
  return data.results.map(toMovie);
}

// รายละเอียดเรื่องเดียว (ได้ genres เป็นชื่อมาเลย ไม่ต้องใช้ genreMap)
export async function getMovie(id) {
  const data = await getJSON(`/movie/${id}`);
  return toMovie(data);
}