import type { IconName } from '@/components';

/**
 * The built-in travel phrasebook.
 *
 * Written once, in English, and translated into whatever language the user is
 * travelling in when the screen shows them — so one short list serves every
 * one of the app's languages. Kept to phrases a traveller actually says, in
 * the situations where reaching for a keyboard is hardest.
 */
export type PhraseCategory = {
  key: string;
  label: string;
  icon: IconName;
  phrases: readonly string[];
};

/** The language the phrasebook is written in. */
export const PHRASEBOOK_LANGUAGE = 'en';

export const PHRASE_CATEGORIES: readonly PhraseCategory[] = [
  {
    key: 'basics',
    label: 'Basics',
    icon: 'chatbubble-ellipses-outline',
    phrases: [
      'Hello',
      'Thank you',
      'Please',
      'Excuse me',
      "Sorry, I don't understand.",
      'Do you speak English?',
      'Could you speak more slowly, please?',
    ],
  },
  {
    key: 'directions',
    label: 'Directions',
    icon: 'navigate-outline',
    phrases: [
      'Where is the train station?',
      'Where is the bathroom?',
      'How do I get to this address?',
      'Is it far from here?',
      'Can you show me on the map?',
    ],
  },
  {
    key: 'transport',
    label: 'Transport',
    icon: 'bus-outline',
    phrases: [
      'How much is a ticket?',
      'When does the next bus leave?',
      'Please take me to this address.',
      'Stop here, please.',
      'Does this train go to the airport?',
    ],
  },
  {
    key: 'food',
    label: 'Food',
    icon: 'restaurant-outline',
    phrases: [
      'A table for two, please.',
      'Can I see the menu?',
      'I am vegetarian.',
      'I am allergic to nuts.',
      'Water, please.',
      'The bill, please.',
    ],
  },
  {
    key: 'hotel',
    label: 'Hotel',
    icon: 'bed-outline',
    phrases: [
      'I have a reservation.',
      'What time is check-out?',
      'Is breakfast included?',
      'What is the Wi-Fi password?',
      'Can I leave my luggage here?',
    ],
  },
  {
    key: 'shopping',
    label: 'Shopping',
    icon: 'bag-handle-outline',
    phrases: [
      'How much does this cost?',
      'Can I pay by card?',
      'Do you have a smaller size?',
      'That is too expensive.',
      'I am just looking, thank you.',
    ],
  },
  {
    key: 'emergency',
    label: 'Emergency',
    icon: 'medkit-outline',
    phrases: [
      'Help!',
      'Please call the police.',
      'I need a doctor.',
      'Where is the nearest hospital?',
      'I lost my passport.',
    ],
  },
];
