import $ from 'cafy';
import define from '../../define';
import { genId } from '../../../../misc/gen-id';
import { Antennas, UserLists, UserGroupJoinings } from '../../../../models';
import { ID } from '../../../../misc/cafy-id';
import { ApiError } from '../../error';

export const meta = {
	tags: ['antennas'],

	requireCredential: true as const,

	kind: 'write:account',

	params: {
		name: {
			validator: $.str.range(1, 100)
		},

		src: {
			validator: $.str.or(['home', 'all', 'users', 'list', 'group'])
		},

		userListId: {
			validator: $.nullable.optional.type(ID),
		},

		userGroupId: {
			validator: $.nullable.optional.type(ID),
		},

		keywords: {
			validator: $.arr($.arr($.str))
		},

		excludeKeywords: {
			validator: $.arr($.arr($.str))
		},

		users: {
			validator: $.arr($.str)
		},

		caseSensitive: {
			validator: $.bool
		},

		withReplies: {
			validator: $.bool
		},

		withFile: {
			validator: $.bool
		},

		notify: {
			validator: $.bool
		}
	},

	errors: {
		noSuchUserList: {
			message: 'No such user list.',
			code: 'NO_SUCH_USER_LIST',
			id: '95063e93-a283-4b8b-9aa5-bcdb8df69a7f'
		},

		noSuchUserGroup: {
			message: 'No such user group.',
			code: 'NO_SUCH_USER_GROUP',
			id: 'aa3c0b9a-8cae-47c0-92ac-202ce5906682'
		},

		noKeywords: {
			message: "No keywords",
			code: "NO_KEYWORDS",
			id: "aa975b74-1ddb-11ee-be56-0242ac120002",
		},
	}
};

export default define(meta, async (ps, user) => {
	let userList;
	let userGroupJoining;

	if ((ps.keywords.length === 0) || ps.keywords[0].every(x => x === '')) throw new ApiError(meta.errors.noKeywords);

	if (ps.src === 'list') {
		userList = await UserLists.findOne({
			id: ps.userListId,
			userId: user.id,
		});

		if (userList == null) {
			throw new ApiError(meta.errors.noSuchUserList);
		}
	} else if (ps.src === 'group') {
		userGroupJoining = await UserGroupJoinings.findOne({
			userGroupId: ps.userGroupId,
			userId: user.id,
		});

		if (userGroupJoining == null) {
			throw new ApiError(meta.errors.noSuchUserGroup);
		}
	}

	const antenna = await Antennas.save({
		id: genId(),
		createdAt: new Date(),
		userId: user.id,
		name: ps.name,
		src: ps.src,
		userListId: userList ? userList.id : null,
		userGroupJoiningId: userGroupJoining ? userGroupJoining.id : null,
		keywords: ps.keywords,
		excludeKeywords: ps.excludeKeywords,
		users: ps.users,
		caseSensitive: ps.caseSensitive,
		withReplies: ps.withReplies,
		withFile: ps.withFile,
		notify: ps.notify,
	});

	return await Antennas.pack(antenna);
});
