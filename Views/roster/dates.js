import moment from 'moment';

export default (from, to) => {
  const list = [];
  let day = from.clone();

  do {
    list.push(day);
    day = day.clone().add(1, 'd');
  } while (day <= to);
  return list;
};
