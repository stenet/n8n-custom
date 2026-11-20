/**
 * Eine per Quack bereitgestellte Datenbank-Datei mit ihrem Namen in der UI und ihrem Port.
 */
export interface IPublishedDatabase {
  path: string;
  name: string;
  port: number;
}
