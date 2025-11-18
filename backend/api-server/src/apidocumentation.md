
User Model:

```
// response from server
type User = {
  id: number;          // i32
  username: string;
  email: string;
};

```

The above is how a user is represented in the database. We currently support some key operations with REST. These are broken into several key categories:

### POST - Create Functionality

```
// POST request body
type NewUser = {
  username: string;
  email: string;
};
```


To create a user, we send a POST request to the endpoint `BASE_URL/users`. The response will be int he format below:

```
{
  "id": 1,
  "username": "mint",
  "email": "mint@example.com"
}

```

### GET - List Functionality

To get the list of users, we can send a GET request to the endpoint of `BASE_URL/users`.

```
[

    {

        "id": 2,

        "username": "gus",

        "email": "agastya.rai05@gmai.com"

    },

    {

        "id": 3,

        "username": "h",

        "email": "fake_email@gmail.com"

    },

    {

        "id": 4,

        "username": "newgeneric",

        "email": "newgeneric@email.com"

    },

    {

        "id": 5,

        "username": "generic",

        "email": "genericemail@genericdomain.com"

    }

]
```


### PUT - Update Functionality

```
// PUT (request body; all optional)
type UpdateUser = {
  username?: string;
  email?: string;
};
```

To update a user, we send a PUT request to the endpoint with the specified user id in the url, such as `BASE_URL/users/5`. In the JSON, we can pass an updated username or email as parameters.

```
{
  "username": "generic_update"
  "email": "generic_email_updated"
}
```

We can choose to update either or both of them individually. If you try to do update nothing (i.e. send an empty JSON), no update will be issued.



This should respond with the updated user.

```
{
  "id": 5,
  "username": "generic_update",
  "email": "generic_email_updated"
}

```

### DELETE - Remove Functionality

To delete a user, we send a DELETE request to the endpoint with the specified user id in the url, such as `BASE_URL/users/5`. No JSON body is needed, just the user ID in the url.


